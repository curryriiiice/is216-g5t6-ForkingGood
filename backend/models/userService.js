import supabase from "./connection.js";

// get user's posts
// get user's liked posts 
// make post 
// edit profile 

const getPostbyId = async (post_id) => {
    const {data, error} = await supabase.from('recommendation').select('*').eq('postid', post_id); 

    if(error){
		return {error};
	}
	return {data};
}
//tested, works 
// returns data arr of a JSON containing post details data: [postid, created_at, review, rating, restaurant_id, poster_email]

export{
    getPostbyId,
}

//testing
//console.log(await supabase.from('recommendation').select('*').eq('postid', '467d2636-bfd6-4ff8-b9ff-f3c7159b23cd'))