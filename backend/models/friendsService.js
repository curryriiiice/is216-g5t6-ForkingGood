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




export{
    getFriends, 
    
}

// for testing 
//console.log(await supabase.from('recommendation').select('postid, restaurant_id').eq('poster_email', 'queclarice28@gmail.com'))
//console.log(await supabase.rpc('get_friend_emails', {user_email: 'clarice.lim.2024@computing.smu.edu.sg'}))
//console.log(await getFriendRecs('clarice.lim.2024@computing.smu.edu.sg'))
//console.log(await supabase.from('recommendation').select('postid','restaurant_id').eq('poster_email', 'clarice.lim.2024@computing.smu.edu.sg'))