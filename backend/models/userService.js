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
        // Use unique filename with timestamp to force overwrite
        const fileName = `profile_${Date.now()}.${fileExtension}`;
        const storagePath = `${user_email}/${fileName}`;

        // Upload new profile photo - will create new file each time
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile-images')
            .upload(storagePath, profile_photo.buffer, {
                upsert: false // Don't upsert, always create new file
            });

        if (uploadError) {
            return { error: uploadError };
        }

        // Generate public URL for the new image
        const { data: { publicUrl } } = supabase.storage
            .from('profile-images')
            .getPublicUrl(storagePath);

        profileImageUrl = publicUrl;

        // Clean up old profile images (keep only the new one and default)
        const { data: existingFiles } = await supabase.storage
            .from('profile-images')
            .list(user_email);

        if (existingFiles) {
            const filesToRemove = existingFiles
                .filter(file => 
                    file.name.startsWith('profile') && 
                    file.name !== fileName && // Keep the new file
                    !file.name.includes('default-avatar') // Keep default
                )
                .map(file => `${user_email}/${file.name}`);
            
            if (filesToRemove.length > 0) {
                await supabase.storage
                    .from('profile-images')
                    .remove(filesToRemove);
            }
        }
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
    // Clean up ALL old profile images (keep only default)
    const { data: existingFiles } = await supabase.storage
        .from('profile-images')
        .list(user_email);

    if (existingFiles) {
        const filesToRemove = existingFiles
            .filter(file => file.name.startsWith('profile')) // Remove all profile_ files
            .map(file => `${user_email}/${file.name}`);
        
        if (filesToRemove.length > 0) {
            await supabase.storage
                .from('profile-images')
                .remove(filesToRemove);
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
        // First, get the user's UID from the public.user table
        const { data: userData, error: userError } = await supabase
            .from('user')
            .select('uid')
            .eq('user_email', user_email)
            .single();

        if (userError) {
            return { error: `User not found: ${userError.message}` };
        }

        const userId = userData.uid;

        // Improved helper function to delete all files in a folder
        const deleteFolderRecursively = async (bucketName, folderPath) => {
            try {
                console.log(`🗑️ Deleting folder: ${bucketName}/${folderPath}`);
                
                // List all files in the folder (including subfolders)
                const { data: files, error: listError } = await supabase.storage
                    .from(bucketName)
                    .list(folderPath, {
                        limit: 1000, // Increase limit to get all files
                        offset: 0
                    });

                if (listError) {
                    if (listError.message?.includes('not found') || listError.message?.includes('No such file or directory')) {
                        console.log(`📁 Folder ${folderPath} doesn't exist in ${bucketName}`);
                        return;
                    }
                    throw listError;
                }

                if (!files || files.length === 0) {
                    console.log(`📁 Folder ${folderPath} is empty in ${bucketName}`);
                    return;
                }

                // Extract file paths for deletion
                const filesToRemove = files
                    .filter(file => !file.id) // Only files, not folders
                    .map(file => `${folderPath}/${file.name}`);

                console.log(`📄 Files to delete from ${bucketName}:`, filesToRemove);

                // Delete all files in the folder
                if (filesToRemove.length > 0) {
                    const { error: removeError } = await supabase.storage
                        .from(bucketName)
                        .remove(filesToRemove);

                    if (removeError) {
                        console.error(`❌ Error deleting files from ${bucketName}:`, removeError);
                        throw removeError;
                    }
                    console.log(`✅ Successfully deleted ${filesToRemove.length} files from ${bucketName}/${folderPath}`);
                }

                // Recursively handle subfolders
                const folders = files.filter(file => file.id); // Folders have id
                for (const folder of folders) {
                    await deleteFolderRecursively(bucketName, `${folderPath}/${folder.name}`);
                }

            } catch (error) {
                console.error(`❌ Error deleting folder ${bucketName}/${folderPath}:`, error);
                throw error;
            }
        };

        console.log(`🚮 Starting deletion process for user: ${user_email}`);

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

        // Delete user from auth schema using admin API
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);

        if (authDeleteError) {
            console.error('Failed to delete user from auth:', authDeleteError);
            // Continue anyway since we've deleted the public data
        }

        console.log(`✅ Successfully deleted account for user: ${user_email}`);
        return { data: { message: "User account data deleted successfully" } };

    } catch (error) {
        console.error('❌ Error in deleteUserAccount:', error);
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

const getAllUsernames = async () => {
    let final_lst = []; 
    const {data, error} = await supabase.from('user').select('username'); 

    if(error){
        return {error}
    }

    for(let names of data){
        final_lst.push(names.username); 
    }

    return {data: final_lst}; 
}
// tested, works

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
    getAllUsernames,


}

//testing
// console.log(await supabase.from('recommendation').select('*').eq('postid', '467d2636-bfd6-4ff8-b9ff-f3c7159b23cd'))
//console.log(await getUsernamebyEmail('queclarice28@gmail.com'))
//console.log(await getPostbyId("467d2636-bfd6-4ff8-b9ff-f3c7159b23cd"))
// let address = '133 Pasir Ris Rd, Singapore 519149'
// console.log(await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`))
//console.log(await getAllUsernames())