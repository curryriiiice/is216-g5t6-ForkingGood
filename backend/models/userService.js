import supabase from "./connection.js";
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

export{
    getPostbyId,
    getUsernamebyEmail
}

//testing
// console.log(await supabase.from('recommendation').select('*').eq('postid', '467d2636-bfd6-4ff8-b9ff-f3c7159b23cd'))
//console.log(await getUsernamebyEmail('queclarice28@gmail.com'))
//console.log(await getPostbyId("467d2636-bfd6-4ff8-b9ff-f3c7159b23cd"))