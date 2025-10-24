import supabase from "./connection.js";
const reverseSearch = async (imageBuffer) => {
    // 1. Call Google Cloud Vision API
    const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            requests: [
                {
                    image: {
                        content: imageBuffer.toString('base64')
                    },
                    features: [
                        {
                            type: 'WEB_DETECTION',
                            maxResults: 10
                        },
                        {
                            type: 'LABEL_DETECTION',
                            maxResults: 10
                        }
                    ]
                }
            ]
        })
    });

    const visionData = await visionResponse.json();
    
    if (visionData.error) {
        return { error: `Vision API error: ${visionData.error.message}` };
    }

    // 2. Extract food-related labels
    const foodLabels = [];
    const webEntities = visionData.responses[0]?.webDetection?.webEntities || [];
    const labels = visionData.responses[0]?.labelAnnotations || [];

    webEntities.forEach(entity => {
        if (entity.description && isFoodRelated(entity.description)) {
            foodLabels.push(entity.description.toLowerCase());
        }
    });

    labels.forEach(label => {
        if (label.description && isFoodRelated(label.description) && !foodLabels.includes(label.description.toLowerCase())) {
            foodLabels.push(label.description.toLowerCase());
        }
    });

    if (foodLabels.length === 0) {
        return { data: "No food items detected in the image" };
    }

    console.log('Detected food labels:', foodLabels);

    // 3. Search for restaurants using the labels
    const restaurants = new Map();

    for (const label of foodLabels.slice(0, 3)) {
        if (restaurants.size >= 10) break;

        const placesResponse = await fetch(
            `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(label + ' restaurant Singapore')}&key=${process.env.GOOGLE_MAPS_API_KEY}`
        );
        
        const placesData = await placesResponse.json();
        
        if (placesData.status === 'OK') {
            // Process each restaurant to get photos
            for (const place of placesData.results.slice(0, 5)) {
                if (restaurants.size >= 10) break;
                
                // Get restaurant photos
                const restaurantPhotos = await getRestaurantPhotos(place.place_id);
                
                const restaurant = {
                    placeID: place.place_id,
                    name: place.name,
                    latitude: place.geometry.location.lat,
                    longitude: place.geometry.location.lng,
                    address: place.formatted_address,
                    cuisine_type: label,
                    area: extractArea(place.formatted_address),
                    price_level: place.price_level || 0,
                    pictures: restaurantPhotos // Add photos array
                };
                
                restaurants.set(place.place_id, restaurant);
            }
        }
    }

    const restaurantArray = Array.from(restaurants.values());
    
    if (restaurantArray.length === 0) {
        return { data: "No matching restaurants found" };
    }

    return { data: restaurantArray };
};

// New function to get restaurant photos
const getRestaurantPhotos = async (placeId) => {
    try {
        // Get place details to access photos
        const detailsResponse = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${process.env.GOOGLE_MAPS_API_KEY}`
        );
        
        const detailsData = await detailsResponse.json();
        
        if (detailsData.status !== 'OK' || !detailsData.result.photos) {
            return [];
        }

        const photos = [];
        const photoReferences = detailsData.result.photos.slice(0, 3); // Max 3 photos
        
        // Generate photo URLs
        for (const photoRef of photoReferences) {
            const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photoRef.photo_reference}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
            photos.push(photoUrl);
        }
        
        return photos;
    } catch (error) {
        console.error('Error fetching restaurant photos:', error);
        return [];
    }
};

// Keep the same helper functions
const isFoodRelated = (label) => {
    const foodKeywords = [
        'food', 'dish', 'cuisine', 'restaurant', 'meal', 'eating', 'dining',
        'noodle', 'rice', 'pasta', 'pizza', 'burger', 'sushi', 'ramen', 'curry',
        'soup', 'salad', 'seafood', 'meat', 'vegetable', 'fruit', 'dessert',
        'bakery', 'cafe', 'coffee', 'tea', 'beverage', 'drink', 'chicken', 'beef',
        'pork', 'fish', 'vegetarian', 'vegan', 'asian', 'western', 'chinese',
        'japanese', 'korean', 'thai', 'vietnamese', 'malay', 'indian', 'italian',
        'french', 'mexican'
    ];
    
    return foodKeywords.some(keyword => 
        label.toLowerCase().includes(keyword)
    );
};

const extractArea = (address) => {
    const singaporeAreas = [
        'orchard', 'raffles', 'marina', 'sentosa', 'chinatown', 'little india',
        'kampong glam', 'bugis', 'dhoby ghaut', 'somerset', 'city hall',
        'tanjong pagar', 'raffles place', 'telok ayer', 'outram', 'maxwell',
        'tiong bahru', 'queenstown', 'redhill', 'commonwealth', 'buona vista',
        'dover', 'clementi', 'jurong', 'pioneer', 'boon lay', 'lakeside',
        'chinese garden', 'pasir ris', 'tampines', 'simei', 'tanah merah',
        'bedok', 'kembangan', 'eunos', 'payalebar', 'aljunied', 'kallang',
        'lavender', 'bendemeer', 'geylang', 'paya lebar', 'macpherson',
        'potong pasir', 'woodleigh', 'serangoon', 'kovan', 'hougang',
        'buangkok', 'sengkang', 'punggol', 'bishan', 'marymount', 'caldecott',
        'botanic gardens', 'farrer road', 'holland village', 'one-north',
        'kent ridge', 'haw par villa', 'pasir panjang', 'labrador park',
        'harbourfront', 'mountbatten', 'stadium', 'nicoll highway', 'promenade',
        'bayfront', 'marina bay', 'esplanade', 'bras basah', 'bencoolen',
        'jalan besar', 'farrer park', 'boon keng', 'toa payoh', 'braddell',
        'novena', 'newton', 'orchard boulevard', 'great world', 'havelock'
    ];
    
    const area = singaporeAreas.find(area => 
        address.toLowerCase().includes(area)
    );
    
    return area || 'Singapore';
};



export{
    reverseSearch,
    
}