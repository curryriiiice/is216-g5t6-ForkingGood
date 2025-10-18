import * as service from '../models/friendsService.js';

// insert functions here 
// eg 
// const inviteGroupMembers = async (req, res) => {xxxx}
const getFriends = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: getFriendsError } = await service.getFriends(user_email);

    if (getFriendsError) {
        return res.status(500).json({ message: "Error getting user's friends" });
    }

    return res.status(200).json({ data });
} 
// tested, works
// returns a JSON containing an array of the user's friends with data as the key, eg {data: [email1, email2]}


const acceptFriendReq = async (req, res) => {
    // get data from FE
    const { user_email, friend_email } = req.body;
    
    // check if everything is received 
    if (!user_email || !friend_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: acceptFriendReqError } = await service.acceptFriendReq(user_email, friend_email);

    if (acceptFriendReqError) {
        return res.status(500).json({ message: "Error accepting friend request" });
    }

    return res.status(200).json({ message: "Friend request accepted!" });
};
// tested, works


const rejectFriendReq = async (req, res) => {
    // get data from FE
    const { user_email, friend_email } = req.body;
    
    // check if everything is received 
    if (!user_email || !friend_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: acceptFriendReqError } = await service.rejectFriendReq(user_email, friend_email);

    if (acceptFriendReqError) {
        return res.status(500).json({ message: "Error rejecting friend request" });
    }

    return res.status(200).json({ message: "Friend request rejected!" });
};
// tested, works


const sendFriendReq = async (req, res) => {
    // get data from FE
    const { user_email, friend_email } = req.body;
    
    // check if everything is received 
    if (!user_email || !friend_email) {
        return res.status(400).json({ error: "Missing information!" });
    }

    const { data, error: sendFriendReqError } = await service.sendFriendReq(user_email, friend_email);

    if (sendFriendReqError) {
        return res.status(500).json({ message: "Error sending friend request" });
    }

    return res.status(200).json({ message: "Friend request sent successfully!" });
};
// tested, works


export{
    getFriends, 
    acceptFriendReq, 
    rejectFriendReq,
    sendFriendReq, 

}