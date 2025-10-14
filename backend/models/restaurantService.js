import supabase from "./connection.js";

// KIV: not sure if there are any endpoints needed here yet 
// get posts by restaurants 

const getRestaurantbyId = async (restaurant_id) => {
    const {data, error} = await supabase.from('restaurant').select('*').eq('placeID', restaurant_id); 

    if(error){
		return {error};
	}
	return {data: data[0]};
}
// tested, works
// returns data: {placeID, name, lat, long, cuisine_type, address}




// testing
//console.log(await getRestaurantbyId('ChIJ9-LvLMc92jEROE9atx0KsEM'))


export{
    getRestaurantbyId,

}