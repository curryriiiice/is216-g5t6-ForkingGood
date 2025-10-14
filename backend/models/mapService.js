import supabase from "./connection.js";
import { getFriends } from "./friendsService.js";

// testing 
//console.log(await supabase.from('restaurant').insert({'postal_code': 630000, 'name': 'test'}));


// get friends emails, return all the cuisines of all the posts by the user's friends
const cuisineFilter = async (user_email) => {
    let cuisine_lst = []; 
    // get list of friend emails 
    const {data: friend_lst, error: getFriendsError} = await getFriends(user_email);
    
    if(getFriendsError){
        return getFriendsError
    }

    for(const friend_email of friend_lst){
        // get restaurantID of posts of each friend 
        const {data: posts, error: postIDError} = await supabase.from('recommendation').select('restaurant_id').eq('poster_email', friend_email); 

        if(postIDError){
            // ignore those friends whose posts cant be retrieved 
            continue
        }
        
        // process each post for this friend (there might be multiple posts per friend)
        for (const post of posts) {
            const restaurant_id = post.restaurant_id; 

            // get coords for this restaurant
            const { data: restaurantData, error: postInfoError } = await supabase.from('restaurant').select('cuisine_type').eq('placeID', restaurant_id);

            if (postInfoError || !restaurantData || restaurantData.length === 0) {
                // ignore those with blank restaurant data or post info error 
                continue;
            }

             // restaurantData is an array, take the first (and likely only) result
            const restaurant = restaurantData[0];
            const cuisine_type = restaurant.cuisine_type;

            cuisine_lst.push(cuisine_type); 
        }
    }

    return {data: cuisine_lst}

}
// tested, works 
// returns an array of strings {data: [xxx, yyy]}

// return the posts of friends which have that cuisine 
const getPostbyCuisine = async(user_email, cuisine_type)=>{
    // get user's list of friends
    const {data: email_arr, error} = await getFriends(user_email);

    if(error){
        return {error};
    }

    return await supabase.rpc('get_friend_recommendations_by_cuisine', {friend_emails:email_arr,input_cuisine_type:cuisine_type})
}
// tested, works
// returns an arr of JSON, each JSON contains post details, eg data: [{postid, created_at, review, rating, restaurant_id, poster_email}, {xxx}]




//testing
//console.log(await cuisineFilter('clarice.lim.2024@computing.smu.edu.sg'))
//console.log(await getPostbyCuisine('clarice.lim.2024@computing.smu.edu.sg', 'Western'))


export{
    cuisineFilter, 
    getPostbyCuisine
}


