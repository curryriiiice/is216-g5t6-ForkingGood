import supabase from './connection.js';
// make functions to query db here
//also add functions to handle other business rules here
//eg const get users = async () => {return await supabase.from("user").select("*")}

// get friends
// get friends' posts

const getFriends = async (user_email) => {
  const { data, error } = await supabase.rpc('get_friend_emails', { user_email: user_email });

  if (error) {
    return { error };
  }
  return { data };
};
// returns an array of the user's friends ([email1, email2])
// tested, works

const acceptFriendReq = async (user_email, friend_email) => {
  const email1 = user_email < friend_email ? user_email : friend_email;
  const email2 = user_email < friend_email ? friend_email : user_email;

  return await supabase.from('friend').update({ request_accepted: true }).match({ email1: email1, email2: email2 });
};
// tested, works

const rejectFriendReq = async (user_email, friend_email) => {
  const email1 = user_email < friend_email ? user_email : friend_email;
  const email2 = user_email < friend_email ? friend_email : user_email;

  return await supabase.from('friend').update({ request_accepted: false }).match({ email1: email1, email2: email2 });
};
// tested, works

const sendFriendReq = async (user_email, friend_email) => {
  const email1 = user_email < friend_email ? user_email : friend_email;
  const email2 = user_email < friend_email ? friend_email : user_email;

  return await supabase.from('friend').insert({ email1: email1, email2: email2 });
};
// tested, works

// --- NEW FUNCTION: removeFriend ---
const removeFriend = async (user_email, friend_email) => {
  const email1 = user_email < friend_email ? user_email : friend_email;
  const email2 = user_email < friend_email ? friend_email : user_email;

  // This deletes the row from the 'friend' table
  return await supabase.from('friend').delete().match({ email1: email1, email2: email2 });
};

// --- NEW FUNCTION: getPendingFriendReqs ---
const getPendingFriendReqs = async (user_email) => {
  // This assumes you have an RPC in Supabase called 'get_pending_friend_reqs'
  // that works just like your 'get_friend_emails' RPC.
  const { data, error } = await supabase.rpc('get_pending_friend_reqs', { user_email: user_email });

  if (error) {
    return { error };
  }
  return { data };
};

export {
  getFriends,
  acceptFriendReq,
  rejectFriendReq,
  sendFriendReq,
  removeFriend, // <-- ADDED
  getPendingFriendReqs, // <-- ADDAD
};

// for testing
//console.log(await supabase.from('recommendation').select('postid, restaurant_id').eq('poster_email', 'queclarice28@gmail.com'))
//console.log(await supabase.rpc('get_friend_emails', {user_email: 'clarice.lim.2024@computing.smu.edu.sg'}))
//console.log(await getFriendRecs('clarice.lim.2024@computing.smu.edu.sg'))
//console.log(await supabase.from('recommendation').select('postid','restaurant_id').eq('poster_email', 'clarice.lim.2024@computing.smu.edu.sg'))