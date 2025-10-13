import supabase from "./connection.js";
// make functions to query db here
//also add functions to handle other business rules here
//eg const get users = async () => {return await supabase.from("user").select("*")}

// get friends
// get friends' posts

const getFriends = async (user_email) => {
    const {data, error} = await supabase.rpc('get_friend_emails', {user_email: user_email});

    if(error){
		return {error};
	}
	return {data};
}
// returns an array of the user's friends ([email1, email2])
// tested, works

const getFriendRecs = async (user_email) => {
    let friends_posts = []; 
    const {data: friend_lst, error: getFriendsError} = await getFriends(user_email);
    
    if(getFriendsError){
        return getFriendsError
    }

    for(const friend_email of friend_lst){
        // get posts of each friend 
        const {data: posts, error: postIDError} = await supabase.from('recommendation').select('postid, restaurant_id').eq('poster_email', friend_email); 

        if(postIDError){
            // ignore those friends whose posts cant be retrieved 
            continue
        }
        
        // process each post for this friend (there might be multiple posts per friend)
        for (const post of posts) {
            const postid = post.postid; 
            const restaurant_id = post.restaurant_id; 

            // get coords for this restaurant
            const { data: restaurantData, error: postInfoError } = await supabase.from('restaurant').select('latitude, longitude').eq('placeID', restaurant_id);

            if (postInfoError || !restaurantData || restaurantData.length === 0) {
                // ignore those with blank restaurant data or post info error 
                continue;
            }

             // restaurantData is an array, take the first (and likely only) result
            const restaurant = restaurantData[0];
            const lat = restaurant.latitude;
            const long = restaurant.longitude;

            friends_posts.push({ postid, latitude: lat, longitude: long, restaurant_id }); 
        }
    }

    return {data: friends_posts}

}
//tested, works 
// returns an array of JSONs containing the user's friends’ post id, lat, long


export{
    getFriends, 
    getFriendRecs
}

// for testing 
//console.log(await supabase.from('recommendation').select('postid, restaurant_id').eq('poster_email', 'queclarice28@gmail.com'))
//console.log(await supabase.rpc('get_friend_emails', {user_email: 'clarice.lim.2024@computing.smu.edu.sg'}))
//console.log(await getFriendRecs('clarice.lim.2024@computing.smu.edu.sg'))
//console.log(await supabase.from('recommendation').select('postid','restaurant_id').eq('poster_email', 'clarice.lim.2024@computing.smu.edu.sg'))