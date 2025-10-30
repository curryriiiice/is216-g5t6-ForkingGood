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


const acceptFriendReq = async (user_email, friend_email) => {
    const email1 = user_email < friend_email ? user_email : friend_email;
    const email2 = user_email < friend_email ? friend_email : user_email;

    return await supabase.from('friend').update({ request_accepted: true }).match({email1:email1, email2:email2});
}
// tested, works


const rejectFriendReq = async (user_email, friend_email) => {
    const email1 = user_email < friend_email ? user_email : friend_email;
    const email2 = user_email < friend_email ? friend_email : user_email;

    return await supabase.from('friend').update({ request_accepted: false }).match({email1:email1, email2:email2});
}
// tested, works


const sendFriendReq = async (user_email, friend_email) => {
    const email1 = user_email < friend_email ? user_email : friend_email;
    const email2 = user_email < friend_email ? friend_email : user_email;

    return await supabase.from('friend').insert({email1: email1,email2: email2, sent_by:user_email})
}
// tested, works

const getPendingFriendReqs = async (user_email) => {
    return await supabase.rpc('get_pending_friend_requests', {input_user_email: user_email});
};

const commentPost = async (postid, commenter_email, comment) => {
    return await supabase.from('comments').insert({postid: postid, commenter_email: commenter_email, comment: comment}); 
}

const getCommentsbyPostId = async (postid) => {
    return await supabase.from('comments').select('commenter_email, comment').match({postid: postid})
}

const likePost = async (postid, liker_email) => {
    return await supabase.from('liked').insert({postid: postid, liker_email:liker_email}); 
}

const unlikePost = async (postid, liker_email) => {
    return await supabase.from('liked').delete().match({postid: postid, liker_email:liker_email}); 
}

const getLikesbyPostId = async (postid) => {
    const{data, error} = await supabase.from('liked').select('liker_email').match({postid: postid}); 

    if (error) {
        return { error };
    }

    // extract only emails from objs
    const emails = data.map(like => like.liker_email);

    return { data: emails };
}

const removeFriend = async (user_email, friend_email) => {
    const email1 = user_email < friend_email ? user_email : friend_email;
    const email2 = user_email < friend_email ? friend_email : user_email;

    return await supabase.from('friend').delete().match({email1: email1, email2:email2})
};

const isFriends = async (user_email, friend_email) => {
    const email1 = user_email < friend_email ? user_email : friend_email;
    const email2 = user_email < friend_email ? friend_email : user_email;

    const { data, error } = await supabase.from('friend').select('request_accepted').match({'email1': email1, 'email2': email2}).single();

    if (error) {
        // If no row found, they are not friends
        if (error.code === 'PGRST116') {
            return { data: false };
        }
        return { error };
    }

    // Return true only if request_accepted is true
    return { data: data.request_accepted === true };
};
const deleteComment = async (postid, commenter_email, comment) => {
    return await supabase.from('comments').delete().match({postid: postid, commenter_email:commenter_email, comment:comment}); 
}

const editComment = async (postid, commenter_email, new_comment, old_comment) => {
    return await supabase.from('comments').update({comment:new_comment}).match({postid: postid, commenter_email:commenter_email, comment:old_comment}); 
}

export{
    getFriends, 
    acceptFriendReq, 
    rejectFriendReq,
    sendFriendReq,
    getPendingFriendReqs, 
    commentPost, 
    getCommentsbyPostId, 
    likePost, 
    unlikePost, 
    getLikesbyPostId, 
    removeFriend,
    isFriends,
    deleteComment,
    editComment,



}

// for testing 
//console.log(await supabase.from('recommendation').select('postid, restaurant_id').eq('poster_email', 'queclarice28@gmail.com'))
//console.log(await supabase.rpc('get_friend_emails', {user_email: 'clarice.lim.2024@computing.smu.edu.sg'}))
//console.log(await getFriendRecs('clarice.lim.2024@computing.smu.edu.sg'))
//console.log(await supabase.from('recommendation').select('postid','restaurant_id').eq('poster_email', 'clarice.lim.2024@computing.smu.edu.sg'))
//console.log(await supabase.from('friend').select('*').is('request_accepted', null).or(`email1.eq.${'clarice.lim.2024@computing.smu.edu.sg'},email2.eq.${'clarice.lim.2024@computing.smu.edu.sg'}`))
//console.log(await supabase.from('comments').select('commenter_email, comment').match({postid: 'b8052dde-a3e5-430e-8a08-e848f41e749b'}));
//console.log(await supabase.from('liked').select('liker_email').match({postid: 'c738085f-ae65-4d6e-9c70-ad176015e8e3'}))