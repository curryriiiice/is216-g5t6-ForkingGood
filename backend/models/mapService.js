import supabase from "./connection.js";

// testing 
//console.log(await supabase.from('restaurant').insert({'postal_code': 630000, 'name': 'test'}));


// get friends emails, return all the cuisines of all the posts by the user's friends
const getAllCuisines = async () => {
    let cuisine_lst = []; 
    const{data: cuisineData, error: getCuisineError} = await supabase.from('restaurant').select('cuisine_type'); 

    if(getCuisineError){
        return {getCuisineError}
    }

    for(let cuisinejson of cuisineData){
        let cuisine_type = cuisinejson.cuisine_type; 
        if(cuisine_type && cuisine_lst.includes(cuisine_type) === false){
            cuisine_lst.push(cuisine_type);     
        }
        
    }
    
    return {data: cuisine_lst}
}
// tested, works 
// returns an array of strings {data: [xxx, yyy]}

const getAllLocations = async () => {
    let area_lst = []; 
    const{data: locationData, error: getLocationError} = await supabase.from('restaurant').select('area'); 

    if(getLocationError){
        return {getLocationError}
    }

    for(let areajson of locationData){
        let area = areajson.area; 
        if(area && area_lst.includes(area) === false){
            area_lst.push(area); 
        }
    }
    
    return {data: area_lst}
}
// tested, works 
// returns an array of strings {data: [xxx, yyy]}

const getFilteredPosts = async (user_email, input_area, input_cuisine_type, input_price_level, input_friends) => {
    let final_area = null; 
    let final_ctype = null; 
    let final_plevel = null; 
    
    if(input_area && input_area.toLowerCase() != "all"){
        final_area = input_area; 
    }

    if(input_cuisine_type && input_cuisine_type.toLowerCase() != "all"){
        final_ctype = input_cuisine_type; 
    }

    if(input_price_level && Number.isInteger(input_price_level)){
        final_plevel = input_price_level; 
    }

    return await supabase.rpc('get_filtered_posts', {input_user_email:user_email, input_area:final_area, input_cuisine_type:final_ctype, input_price_level: final_plevel, input_friends:input_friends})
    // an array of JSONs. each JSON contains post details
    
}
// tested, works


//testing
//console.log(await cuisineFilter('clarice.lim.2024@computing.smu.edu.sg'))
//console.log(await getPostbyCuisine('clarice.lim.2024@computing.smu.edu.sg', 'Western'))
//console.log(await supabase.rpc('get_filtered_posts', {input_user_email:'queclarice28@gmail.com', input_area:null, input_cuisine_type:null, input_price_level: null, input_friends:false}))
//console.log(await supabase.from('restaurant').select('cuisine_type'))
//console.log(await supabase.from('restaurant').select('area'))


export{
    getAllCuisines, 
    getFilteredPosts,
    getAllLocations


}


