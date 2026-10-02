(() => {
  const config = window.ATMOS_SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.anonKey && window.supabase?.createClient);
  const client = configured ? window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function currentUser() { return (await getSession())?.user || null; }

  async function signUp(email, password, displayName) {
    if (!client) throw new Error("Backend not configured");
    const { data, error } = await client.auth.signUp({
      email, password,
      options: { data: { display_name: displayName } }
    });
    if (error) throw error;
    if (data.user) {
      await client.from("profiles").upsert({ id:data.user.id, display_name:displayName }, { onConflict:"id" });
    }
    return data;
  }

  async function signIn(email, password) {
    if (!client) throw new Error("Backend not configured");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function getProfile() {
    const user = await currentUser();
    if (!user) return null;
    const { data, error } = await client.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
    if (error) throw error;
    return { user, displayName:data?.display_name || user.user_metadata?.display_name || user.email?.split("@")[0] || "Atmos user" };
  }

  async function updateProfile(displayName) {
    const user = await currentUser();
    if (!user) throw new Error("AUTH_REQUIRED");
    const { error } = await client.from("profiles").upsert({id:user.id,display_name:displayName},{onConflict:"id"});
    if (error) throw error;
    await client.auth.updateUser({ data:{display_name:displayName} });
  }

  async function listBeachReviews(beachKey) {
    if (!client) return null;
    const { data, error } = await client.from("beach_reviews")
      .select("id, user_id, beach_key, beach_name, author, description, overall, cleanliness, water, crowds, safety, amenities, parking, family, scenery, water_clarity, sand_quality, bathrooms, visit_date, created_at")
      .eq("beach_key", beachKey).order("created_at", { ascending: true }).limit(300);
    if (error) throw error;
    return (data || []).map(row => ({
      id:row.id,userId:row.user_id,author:row.author,description:row.description,visitDate:row.visit_date,createdAt:row.created_at,
      ratings:{overall:row.overall,cleanliness:row.cleanliness,water:row.water,crowds:row.crowds,safety:row.safety,amenities:row.amenities,parking:row.parking,family:row.family,scenery:row.scenery,waterClarity:row.water_clarity,sandQuality:row.sand_quality,bathrooms:row.bathrooms}
    }));
  }

  async function createBeachReview(place, beachKey, review) {
    if (!client) return null;
    const user = await currentUser();
    if (!user) throw new Error("AUTH_REQUIRED");
    const r=review.ratings;
    const payload={user_id:user.id,beach_key:beachKey,beach_name:place.name,latitude:Number(place.latitude),longitude:Number(place.longitude),author:review.author,description:review.description,visit_date:review.visitDate||null,overall:r.overall,cleanliness:r.cleanliness,water:r.water,crowds:r.crowds,safety:r.safety,amenities:r.amenities,parking:r.parking,family:r.family,scenery:r.scenery,water_clarity:r.waterClarity,sand_quality:r.sandQuality,bathrooms:r.bathrooms};
    const { data,error }=await client.from("beach_reviews").insert(payload).select().single();
    if(error) throw error; return data;
  }

  async function loadSavedPlaces() {
    const user=await currentUser(); if(!user) return [];
    const {data,error}=await client.from("saved_places").select("place_id,name,admin,country_code,latitude,longitude,kind,is_airport").eq("user_id",user.id).order("created_at");
    if(error) throw error;
    return (data||[]).map(x=>({id:x.place_id,name:x.name,admin:x.admin||"",countryCode:x.country_code||"",latitude:x.latitude,longitude:x.longitude,kind:x.kind||"city",isAirport:x.is_airport||false}));
  }

  async function savePlaces(places) {
    const user=await currentUser(); if(!user) return;
    const clean=places.filter(x=>Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))&&!x.isCurrentLocation).map(x=>({user_id:user.id,place_id:String(x.id),name:x.name,admin:x.admin||"",country_code:x.countryCode||"",latitude:Number(x.latitude),longitude:Number(x.longitude),kind:x.kind||"city",is_airport:Boolean(x.isAirport)}));
    const {error:delError}=await client.from("saved_places").delete().eq("user_id",user.id); if(delError) throw delError;
    if(clean.length){const {error}=await client.from("saved_places").insert(clean);if(error) throw error;}
  }

  function onAuthStateChange(callback){ if(!client) return {data:{subscription:{unsubscribe(){}}}}; return client.auth.onAuthStateChange((event,session)=>callback(event,session)); }

  window.AtmosBackend={configured,client,getSession,currentUser,signUp,signIn,signOut,getProfile,updateProfile,listBeachReviews,createBeachReview,loadSavedPlaces,savePlaces,onAuthStateChange};
})();
