import supabase from "./connection.js";

// testing 
console.log(await supabase.from('restaurant').insert({'postal_code': 600000, 'name': 'test'}));