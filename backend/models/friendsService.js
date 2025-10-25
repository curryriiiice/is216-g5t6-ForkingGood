import supabase from "./connection.js";
// make functions to query db here
//also add functions to handle other business rules here
//eg const get users = async () => {return await supabase.from("user").select("*")}

// get friends
// get friends' posts

const getFriends = async (user_email) => {
  const { data, error } = await supabase.rpc('get_friend_emails', { user_email: user_email })

  if (error) {
    return { error }
  }
  return { data }
}

const acceptFriendReq = async (user_email, friend_email) => {
  const email1 = user_email < friend_email ? user_email : friend_email
  const email2 = user_email < friend_email ? friend_email : user_email

  return await supabase
    .from('friend')
    .update({ request_accepted: true })
    .match({ email1: email1, email2: email2 })
}

const rejectFriendReq = async (user_email, friend_email) => {
  const email1 = user_email < friend_email ? user_email : friend_email
  const email2 = user_email < friend_email ? friend_email : user_email

  return await supabase
    .from('friend')
    .update({ request_accepted: false })
    .match({ email1: email1, email2: email2 })
}

// --- UPDATED sendFriendReq FUNCTION ---
// This version prevents the 500 error and returns friendly messages
const sendFriendReq = async (user_email, friend_email) => {
  const email1 = user_email < friend_email ? user_email : friend_email
  const email2 = user_email < friend_email ? friend_email : user_email

  // 1. Check if a relationship already exists
  const { data: existing, error: checkError } = await supabase
    .from('friend')
    .select('request_accepted')
    .match({ email1: email1, email2: email2 })
    .single()

  if (checkError && checkError.code !== 'PGRST116') {
    // 'PGRST116' means 'No rows found', which is good.
    // Any other error is a real database problem.
    return { error: checkError }
  }

  // 2. Handle different cases
  if (existing) {
    if (existing.request_accepted === true) {
      // They are already friends
      return { error: { message: 'You are already friends with this user.' } }
    }
    if (existing.request_accepted === null) {
      // A request is already pending
      return { error: { message: 'A friend request is already pending.' } }
    }
    if (existing.request_accepted === false) {
      // The request was rejected. Let's re-send it by updating to pending.
      return await supabase
        .from('friend')
        .update({ request_accepted: null })
        .match({ email1: email1, email2: email2 })
    }
  }

  // 3. No existing relationship, create a new pending request
  return await supabase
    .from('friend')
    .insert({ email1: email1, email2: email2, request_accepted: null })
}

const getPendingFriendReqs = async (user_email) => {
  const { data, error: getPendingFriendError } = await supabase
    .from('friend')
    .select('*')
    .is('request_accepted', null)
    .or(`email1.eq.${user_email},email2.eq.${user_email}`)
  if (getPendingFriendError) {
    return getPendingFriendError
  }
  // extract only the other party's emails
  const otherEmails = data.map((friend) =>
    friend.email1 === user_email ? friend.email2 : friend.email1,
  )

  return { data: otherEmails }
}

const commentPost = async (postid, commenter_email, comment) => {
  return await supabase
    .from('comments')
    .insert({ postid: postid, commenter_email: commenter_email, comment: comment })
}

const getCommentsbyPostId = async (postid) => {
  return await supabase.from('comments').select('commenter_email, comment').match({ postid: postid })
}

const likePost = async (postid, liker_email) => {
  return await supabase.from('liked').insert({ postid: postid, liker_email: liker_email })
}

const unlikePost = async (postid, liker_email) => {
  return await supabase.from('liked').delete().match({ postid: postid, liker_email: liker_email })
}

const getLikesbyPostId = async (postid) => {
  const { data, error } = await supabase
    .from('liked')
    .select('liker_email')
    .match({ postid: postid })

  if (error) {
    return { error }
  }

  // extract only emails from objs
  const emails = data.map((like) => like.liker_email)

  return { data: emails }
}

const removeFriend = async (user_email, friend_email) => {
  const email1 = user_email < friend_email ? user_email : friend_email
  const email2 = user_email < friend_email ? friend_email : user_email

  return await supabase.from('friend').delete().match({ email1: email1, email2: email2 })
}

const isFriends = async (user_email, friend_email) => {
  const email1 = user_email < friend_email ? user_email : friend_email
  const email2 = user_email < friend_email ? friend_email : user_email

  const { data, error } = await supabase
    .from('friend')
    .select('request_accepted')
    .match({ email1: email1, email2: email2 })
    .single()

  if (error) {
    // If no row found, they are not friends
    if (error.code === 'PGRST116') {
      return { data: false }
    }
    return { error }
  }

  // Return true only if request_accepted is true
  return { data: data.request_accepted === true }
}
const deleteComment = async (postid, commenter_email, comment) => {
  return await supabase
    .from('comments')
    .delete()
    .match({ postid: postid, commenter_email: commenter_email, comment: comment })
}

const editComment = async (postid, commenter_email, new_comment, old_comment) => {
  return await supabase
    .from('comments')
    .update({ comment: new_comment })
    .match({ postid: postid, commenter_email: commenter_email, comment: old_comment })
}

export {
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