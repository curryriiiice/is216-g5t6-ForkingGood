import supabase from "./connection.js";
import crypto from 'crypto'; 
import {getRestaurantbyId} from "./restaurantService.js"

// get user's posts
// get user's liked posts 
// make post 
// edit profile 

const getPostbyId = async (post_id) => {
    const {data, error} = await supabase.from('recommendation').select('*').eq('postid', post_id); 
    
    if(error){
		return {error};
	}


    // process post to replace poster_email with poster_username and add restaurant_id 
    const post = data[0];
    const { data: usernameData, error: usernameError } = await getUsernamebyEmail(post.poster_email);
    const {data: restaurantData, error: getRestError} = await getRestaurantbyId(post.restaurant_id); 
    
    if (usernameError || getRestError) {
        // if there's error getting username or restaurant data, keep original post data
        return {data: [post]};
    }
    
    // create new object without poster_email and add poster_username
    const { poster_email, ...postWithoutEmail } = post;
    const processedPost = {...postWithoutEmail,poster_username: usernameData, cuisine_type:restaurantData.cuisine_type};

    return {data: processedPost};
}
//tested, works 
// returns a JSON containing post details data: {postid, created_at, review, rating, restaurant_id, poster_username}

const getUsernamebyEmail = async (user_email) => {
    const {data, error} = await supabase.from('user').select('username').eq('user_email', user_email); 

    if(error){
		return {error};
	}
	return {data: data[0].username};
}
// tested, works
// returns username, eg {data: @username}


const createPost = async (user_email, name, address, cuisine_type, rating, review, is_public, photos) => {
    // geocode address to get coordinates and placeID
    const geocodeResponse = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`);
    const geocodeData = await geocodeResponse.json();
    
    if (geocodeData.status !== 'OK') {
        return { error: `Geocoding failed: ${geocodeData.status}` };
    }

    const location = geocodeData.results[0].geometry.location;
    const placeId = geocodeData.results[0].place_id;

    // get restaurant details from Places API
    const placesResponse = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=price_level,address_component&key=${process.env.GOOGLE_MAPS_API_KEY}`);
    const placesData = await placesResponse.json();
    
    if (placesData.status !== 'OK') {
        return { error: `Places API failed: ${placesData.status}` };
    }

    // extract price_level and area
    const priceLevel = placesData.result.price_level || 0;
    
    // extract area from address components (look for locality or neighborhood)
    let area = '';
    const addressComponents = placesData.result.address_components || [];
    const areaComponent = addressComponents.find(comp => 
        comp.types.includes('locality') || comp.types.includes('neighborhood')
    );
    if (areaComponent) {
        area = areaComponent.long_name;
    }

    // upsert restaurant table
    const { data: restaurantData, error: restaurantError } = await supabase
        .from('restaurant')
        .upsert({
            placeID: placeId,
            name: name,
            latitude: location.lat,
            longitude: location.lng,
            cuisine_type: cuisine_type,
            address: address,
            area: area,
            price_level: priceLevel
        }, { onConflict: 'placeID' })
        .select('placeID')
        .single();

    if (restaurantError) {
        return { error: restaurantError };
    }

    // create recommendation post
    const { data: postData, error: postError } = await supabase
    .from('recommendation')
    .insert({
        review: review,
        rating: parseFloat(rating),
        restaurant_id: restaurantData.placeID,
        poster_email: user_email,
        is_public: is_public
    })
    .select('postid')
    .single();

    if (postError) {
        return { error: postError };
    }

    const postId = postData.postid;

    // upload pics to storage and update picture table
    const pictureRecords = [];
    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const pictureId = crypto.randomUUID();
        const fileExtension = photo.originalname.split('.').pop();
        const storagePath = `${user_email}/${postId}/${pictureId}.${fileExtension}`;

        // upload to bucket in supabase storage
        const { data: storageData, error: storageError } = await supabase.storage.from('post-images').upload(storagePath, photo.buffer);

        if (storageError) {
            return { error: storageError };
        }

        // generate public URL
        const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(storagePath);

        // insert into picture table
        const { data: pictureData, error: pictureError } = await supabase.from('picture').insert({postid: postId,pictureid: pictureId,storage_path: storagePath,display_order: i,image_url: publicUrl}).select('pictureid').single();

        if (pictureError) {
            return { error: pictureError };
        }

        pictureRecords.push(pictureData.pictureid);
    }

    return { data: {postId: postId, restaurantId: restaurantData.placeID, pictures: pictureRecords} };
};
// tested, works


export{
    getPostbyId,
    getUsernamebyEmail,
    createPost,

}

//testing
// console.log(await supabase.from('recommendation').select('*').eq('postid', '467d2636-bfd6-4ff8-b9ff-f3c7159b23cd'))
//console.log(await getUsernamebyEmail('queclarice28@gmail.com'))
//console.log(await getPostbyId("467d2636-bfd6-4ff8-b9ff-f3c7159b23cd"))
// let address = '133 Pasir Ris Rd, Singapore 519149'
// console.log(await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`))