import supabase from "./connection.js";
import crypto from 'crypto'; 

// get user's posts
// get user's liked posts 
// make post 
// edit profile 

const getPostbyId = async (post_id) => {
    return await supabase.rpc('get_post_details', {input_postid: post_id});
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

const deletePost = async (postid) => {
    return await supabase.from('recommendation').delete().match({postid: postid}); 
}
// tested, works

const getAllUsers = async (current_user_email) => {
    return await supabase.rpc('get_all_users', {current_user_email: current_user_email});
}

const getLikedPosts = async (user_email) => {
    return await supabase.rpc('get_liked_posts', {input_user_email: user_email});
};

const getUserPosts = async (user_email, friends) => {
    return await supabase.rpc('get_user_posts', {input_user_email: user_email,input_friends: friends});
};

const getPfpByEmail = async (user_email) => {
    const {data, error} = await supabase.from('user').select('profile_image_url').match({user_email:user_email}); 

    if(error){
        return {error}; 
    }

    return {data: data[0].profile_image_url};
};

const editProfile = async (user_email, username, bio, profile_photo) => {
    let profileImageUrl;

    // Handle profile photo upload if provided
    if (profile_photo) {
        const fileExtension = profile_photo.originalname.split('.').pop();
        const fileName = `profile.${fileExtension}`;
        const storagePath = `${user_email}/${fileName}`;

        // Delete old profile image if it exists and is not the default
        const { data: userData } = await supabase
            .from('user')
            .select('profile_image_url')
            .eq('user_email', user_email)
            .single();

        if (userData.profile_image_url && !userData.profile_image_url.includes('default-avatar.jpg')) {
            const oldFileName = userData.profile_image_url.split('/').pop();
            const oldStoragePath = `${user_email}/${oldFileName}`;
            
            await supabase.storage
                .from('profile-images')
                .remove([oldStoragePath]);
        }

        // Upload new profile photo
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile-images')
            .upload(storagePath, profile_photo.buffer, {
                upsert: true // Overwrite if exists
            });

        if (uploadError) {
            return { error: uploadError };
        }

        // Generate public URL for the new image
        const { data: { publicUrl } } = supabase.storage
            .from('profile-images')
            .getPublicUrl(storagePath);

        profileImageUrl = publicUrl;
    }

    // Update user profile in database
    const updateData = {
        username: username
    };

    // Only add bio if provided
    if (bio !== undefined) {
        updateData.bio = bio;
    }

    // Only update profile image URL if a new photo was uploaded
    if (profile_photo) {
        updateData.profile_image_url = profileImageUrl;
    }

    const { data: updatedUser, error: updateError } = await supabase
        .from('user')
        .update(updateData)
        .eq('user_email', user_email)
        .select('user_email, username, profile_image_url, bio')
        .single();

    if (updateError) {
        return { error: updateError };
    }

    return { data: updatedUser };
};

const removeProfilePicture = async (user_email) => {
    // Get current user data to check existing profile picture
    const { data: userData, error: userError } = await supabase
        .from('user')
        .select('profile_image_url')
        .eq('user_email', user_email)
        .single();

    if (userError) {
        return { error: userError };
    }

    // Delete current profile picture from storage if it's not the default
    if (userData.profile_image_url && !userData.profile_image_url.includes('default-avatar.jpg')) {
        const fileName = userData.profile_image_url.split('/').pop();
        const storagePath = `${user_email}/${fileName}`;
        
        const { error: deleteError } = await supabase.storage
            .from('profile-images')
            .remove([storagePath]);

        if (deleteError) {
            return { error: deleteError };
        }
    }

    // Set profile image URL back to default avatar
    const defaultAvatarPath = `${user_email}/default-avatar.jpg`;
    const { data: { publicUrl } } = supabase.storage
        .from('profile-images')
        .getPublicUrl(defaultAvatarPath);

    // Update user profile with default avatar URL
    const { data: updatedUser, error: updateError } = await supabase
        .from('user')
        .update({
            profile_image_url: publicUrl
        })
        .eq('user_email', user_email)
        .select('user_email, username, profile_image_url, bio')
        .single();

    if (updateError) {
        return { error: updateError };
    }

    return { data: updatedUser };
};


const getProfile = async (user_email) => {
    const {data, error} = await supabase.from('user').select('username, bio, profile_image_url').eq('user_email', user_email);
    
    if (error){
        return {error}
    }

    return {data: data[0]}
};

const deleteUserAccount = async (user_email) => {
    try {
        // helper function to delete all files in a folder recursively
        const deleteFolderRecursively = async (bucketName, folderPath) => {
            const { data: files, error } = await supabase.storage
                .from(bucketName)
                .list(folderPath);
            
            if (error) {
                // Folder doesn't exist, which is fine
                if (error.message.includes('not found')) {
                    return;
                }
                throw error;
            }
            
            if (files && files.length > 0) {
                const filesToRemove = [];
                
                for (const file of files) {
                    const filePath = folderPath ? `${folderPath}/${file.name}` : file.name;
                    
                    if (file.id) {
                        // It's a folder, recurse into it
                        await deleteFolderRecursively(bucketName, filePath);
                    } else {
                        // It's a file, add to removal list
                        filesToRemove.push(filePath);
                    }
                }
                
                // Remove all files in current folder
                if (filesToRemove.length > 0) {
                    await supabase.storage
                        .from(bucketName)
                        .remove(filesToRemove);
                }
            }
        };

        // delete user's entire folder from post-images storage
        await deleteFolderRecursively('post-images', user_email);

        // delete user's profile picture folder from storage
        await deleteFolderRecursively('profile-images', user_email);

        // delete user record (cascade will handle related tables)
        const { data, error: deleteError } = await supabase
            .from('user')
            .delete()
            .eq('user_email', user_email)
            .select()
            .single();

        if (deleteError) {
            return { error: deleteError };
        }

        return { data: { message: "User account data deleted successfully" } };

    } catch (error) {
        return { error: error.message };
    }
};

const editPost = async (postid, user_email, name, address, cuisine_type, rating, review, is_public) => {
    // First verify the user owns this post
    const { data: postData, error: postCheckError } = await supabase
        .from('recommendation')
        .select('poster_email, restaurant_id')
        .eq('postid', postid)
        .single();

    if (postCheckError) {
        return { error: postCheckError };
    }

    if (postData.poster_email !== user_email) {
        return { error: "Unauthorized: You can only edit your own posts" };
    }

    // Geocode address to get coordinates and placeID
    const geocodeResponse = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`);
    const geocodeData = await geocodeResponse.json();
    
    if (geocodeData.status !== 'OK') {
        return { error: `Geocoding failed: ${geocodeData.status}` };
    }

    const location = geocodeData.results[0].geometry.location;
    const placeId = geocodeData.results[0].place_id;

    // Get restaurant details from Places API
    const placesResponse = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=price_level,address_component&key=${process.env.GOOGLE_MAPS_API_KEY}`);
    const placesData = await placesResponse.json();
    
    if (placesData.status !== 'OK') {
        return { error: `Places API failed: ${placesData.status}` };
    }

    // Extract price_level and area
    const priceLevel = placesData.result.price_level || 0;
    
    // Extract area from address components
    let area = '';
    const addressComponents = placesData.result.address_components || [];
    const areaComponent = addressComponents.find(comp => 
        comp.types.includes('locality') || comp.types.includes('neighborhood')
    );
    if (areaComponent) {
        area = areaComponent.long_name;
    }

    // Update restaurant table
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

    // Update recommendation post
    const { data: updatedPostData, error: updatePostError } = await supabase
        .from('recommendation')
        .update({
            review: review,
            rating: parseFloat(rating),
            restaurant_id: restaurantData.placeID,
            is_public: is_public
        })
        .eq('postid', postid)
        .select('postid')
        .single();

    if (updatePostError) {
        return { error: updatePostError };
    }

    return { 
        data: { 
            postId: updatedPostData.postid, 
            restaurantId: restaurantData.placeID 
        } 
    };
};

export{
    getPostbyId,
    getUsernamebyEmail,
    createPost,
    deletePost, 
    getAllUsers, 
    getLikedPosts,
    getUserPosts,
    getPfpByEmail,
    editProfile,
    removeProfilePicture,
    getProfile,
    deleteUserAccount,
    editPost,
    

}

//testing
// console.log(await supabase.from('recommendation').select('*').eq('postid', '467d2636-bfd6-4ff8-b9ff-f3c7159b23cd'))
//console.log(await getUsernamebyEmail('queclarice28@gmail.com'))
//console.log(await getPostbyId("467d2636-bfd6-4ff8-b9ff-f3c7159b23cd"))
// let address = '133 Pasir Ris Rd, Singapore 519149'
// console.log(await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`))
//console.log(await getAllUsernames())