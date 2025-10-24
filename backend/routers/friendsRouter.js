import express from 'express'; // <--- 1. ADDED THIS IMPORT
const router = express.Router();


import {
  getFriends,
  acceptFriendReq,
  rejectFriendReq,
  sendFriendReq,
  getPendingFriendReqs,
  removeFriend,
} from '../controllers/friendsController.js';

//router.get
//router.post etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post('/getFriends', getFriends);
router.post('/acceptFriendReq', acceptFriendReq);
router.post('/rejectFriendReq', rejectFriendReq);
router.post('/sendFriendReq', sendFriendReq);


router.post('/getPendingFriendReqs', getPendingFriendReqs);
router.post('/removeFriend', removeFriend);

export default router;