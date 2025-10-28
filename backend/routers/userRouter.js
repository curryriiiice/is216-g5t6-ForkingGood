import express from "express";
import multer from 'multer';

const router = express.Router();

// middleware to process pictures
const upload = multer({ storage: multer.memoryStorage() });

//import {task1,task2,etc} from "../controllers/taskController";
import {
	getPostbyId,
	getUsernamebyEmail,
	createPost,
	deletePost,
	getAllUsers, 
	getLikedPosts,
	getUserPosts,
	getPfpByEmail,
	editProfile,
	removeProfilePicture, 
	getProfile,
	deleteUserAccount,
	editPost,


}from '../controllers/userController.js';

//router.get
//router.post etc etc for each of the routes
// eg router.post('/getGroups',getGroups);

router.post("/getPostbyId", getPostbyId);
router.post("/getUsernamebyEmail", getUsernamebyEmail);
router.post("/createPost", upload.array('photos'), createPost);
router.delete("/deletePost", deletePost); 
router.post("/getAllUsers", getAllUsers); 
router.post("/getLikedPosts", getLikedPosts);
router.post("/getUserPosts", getUserPosts); 
router.post("/getPfpByEmail", getPfpByEmail);
router.put('/editProfile', upload.single('profile_photo'), editProfile);
router.delete('/removeProfilePicture', removeProfilePicture); 
router.post('/getProfile', getProfile);
router.delete('/deleteUserAccount', deleteUserAccount);
router.put('/editPost', editPost);


export default router;