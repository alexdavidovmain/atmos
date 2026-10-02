# Atmos Weather PWA

This is the browser version of the Atmos Weather app.

## Easiest way to preview on your iPhone

Because iOS does not run local HTML projects directly with full location/network permissions, upload this folder to a free static host:

### Option 1: Netlify Drop
1. On a computer, unzip the project.
2. Open Netlify Drop in a browser.
3. Drag the `AtmosWeather-PWA` folder onto the page.
4. Open the generated link on your iPhone.
5. In Safari, tap Share → Add to Home Screen.

### Option 2: GitHub Pages
1. Create a GitHub repository.
2. Upload all files from the folder.
3. Enable GitHub Pages from the repository settings.
4. Open the generated HTTPS link on your iPhone.
5. Tap Share → Add to Home Screen.

## Features
- Live weather from Open-Meteo
- Current location
- Saved North American cities and airport search
- Hourly and 10-day forecasts
- Local AI-style summary
- Outfit recommendations
- Unit switching
- Home Screen PWA support
- Local storage for places and settings

The app must be served over HTTPS for iPhone geolocation and Home Screen installation to work reliably.


## v3 additions
- Living weather worlds: desert heat, moving sun, wet-glass rain, lightning, fog, snow, waves, sand, and airport planes
- Developer profile renamed to Alex Davidov - Developer
- Nearby airports and beaches
- Save airports and beaches as forecast locations
- Marine data for beaches, including water temperature, wave height, period, and a beach-day score
- Interactive motion on weather cards


## v4 additions
- Three complete appearance modes: Atmos, Black + Accent, and Black & White
- Five selectable accent colors
- Accent-aware weather effects and interface highlights
- Aurora on cold clear nights
- Wind-blown leaves
- Rainbow after showers
- Palm-tree beach animation
- Airport runway animation
- Small haptic feedback on supported mobile browsers


## v4.1 fix
- Restored the missing async fetchWeather function wrapper
- Updated the service-worker cache so the repaired JavaScript replaces the broken v4 build


## v4.2 location header
- Current GPS location now displays “My Location” with the detected city directly underneath.
- Update time remains visible on a smaller third line.
- Existing saved-place and map-related behavior is preserved.


## v4.3 addition
- Added a small secondary temperature under the main reading. Fahrenheit mode shows Celsius, and Celsius mode shows Fahrenheit.


## v4.4 additions
- App starts with the device's current location rather than Boca Raton
- My Location shows the detected city underneath
- Map button beside place search
- Clickable OpenStreetMap city markers, with capitals and major cities emphasized
- Tap anywhere on the map to identify and open that place's weather
- Nearby airports and beaches now refresh around every selected city or map point


## v4.5 additions
- Native Beach Community panel for beach locations
- Star ratings for overall experience, cleanliness, water, crowds, safety, and amenities
- Written beach reports and per-beach rating averages
- Device-local review profiles and review history
- This build stores reviews locally; public cross-user sharing requires an online database and authentication backend


## v4.6 — Shared beach review backend

Atmos now includes an optional Supabase backend for community beach reports.

Setup:
1. Create a Supabase project.
2. Enable Anonymous Sign-Ins in Authentication settings.
3. Run `supabase-schema.sql` in the SQL Editor.
4. Paste the Project URL and publishable/anon key into `supabase-config.js`.
5. Deploy the app over HTTPS.

When Supabase is not configured, Atmos keeps using the local-device review cache. Never place a Supabase `service_role` key in this app.

## v4.7 Live Supabase setup

The Supabase Project URL and publishable browser key are already connected in `supabase-config.js`.

Because an earlier, differently shaped SQL schema was run, open `RUN-THIS-ONCE-IN-SUPABASE.sql`, copy all of it into the Supabase SQL Editor, and press **Run** once. Anonymous Sign-Ins must remain enabled. The reset script removes the old test beach tables/reviews and creates the exact table expected by Atmos.

## v4.7.3 Worldwide nearby search
- Searches airports and beaches separately to prevent large combined map queries from timing out.
- Progressively expands the search radius worldwide.
- Uses Nominatim/OpenStreetMap as a second global fallback when Overpass is unavailable.
- South Florida curated results remain instant, but are no longer the only fallback path.


## v4.7.4 nearby reliability fix
- Airports and beaches resolve independently.
- Every public map request has a strict timeout.
- The interface can no longer remain stuck on Searching.
- Worldwide OpenStreetMap search remains enabled, with Nominatim fallback.


## v4.8 setup
Run `RUN-THIS-ONCE-v4.8.sql` once in Supabase SQL Editor. Email/password login, cloud-saved places, and detailed review fields depend on it. Developer Weather Lab is UI-gated by the requested password; because this is a browser app, this is not server-grade security.


## v4.9 Atmos Labs visual redesign
- Rebuilt the complete visual system around a dark, futuristic automotive-luxury aesthetic.
- Added smoked glass, chrome highlights, ambient accent lighting, command-center sheets, premium map styling, and cohesive Atmos ID surfaces.
- Existing weather, map, community, account, Supabase, beach and developer functionality remains unchanged.
