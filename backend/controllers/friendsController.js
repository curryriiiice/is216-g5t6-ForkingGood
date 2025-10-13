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

const getFriendRecs = async (req, res) => {
    // get user_email from FE
    const { user_email } = req.body;
    // check if user_email is received 
    if (!user_email) {
        return res.status(400).json({ error: "User email is required" });
    }

    const { data, error: getFriendRecsError } = await service.getFriendRecs(user_email);
    if (getFriendRecsError) {
        return res.status(500).json({ message: "Error getting user's friend recommendations" });
    }

    return res.status(200).json({ data });
} 
// tested, works
// returns a JSON containing an array of JSONs of friend posts, eg {data: [{postid:xxx, latitude:1234, longtitude: 1234, restaurant_id:5555}, {xxx}, {xxx}]}


export{
    getFriends, 
    getFriendRecs
}