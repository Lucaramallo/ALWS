// ============================================================================
// WEATHER DASHBOARD - OPEN-METEO API INTEGRATION
// Production-ready backend: geocoding → weather fetch pipeline
// ============================================================================

const API_GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const API_WEATHER = 'https://api.open-meteo.com/v1/forecast';

const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const currentWeatherCard = document.getElementById('currentWeatherCard');
const forecastGrid = document.getElementById('forecastGrid');
const errorMessage = document.getElementById('errorMessage');

let searchTimeout;

// ============================================================================
// WMO WEATHER CODES → EMOJI MAPPING (Complete Standard Codes)
// ============================================================================
const weatherEmojis = {
    0: '☀️',    // Clear sky
    1: '🌤️',    // Mainly clear
    2: '⛅',    // Partly cloudy
    3: '☁️',    // Overcast
    45: '🌫️',   // Foggy
    48: '🌫️',   // Rime fog
    51: '🌧️',   // Light drizzle
    53: '🌧️',   // Moderate drizzle
    55: '🌧️',   // Dense drizzle
    61: '🌧️',   // Slight rain
    63: '🌧️',   // Moderate rain
    65: '⛈️',   // Heavy rain
    71: '❄️',    // Slight snow
    73: '❄️',    // Moderate snow
    75: '❄️',    // Heavy snow
    77: '❄️',    // Snow grains
    80: '🌧️',   // Slight rain showers
    81: '⛈️',   // Moderate rain showers
    82: '⛈️',   // Violent rain showers
    85: '❄️',    // Slight snow showers
    86: '❄️',    // Heavy snow showers
    95: '⛈️',   // Thunderstorm
    96: '⛈️',   // Thunderstorm with hail
    99: '⛈️'    // Thunderstorm with hail
};

const getWeatherEmoji = (code) => weatherEmojis[code] ?? '🌤️';

// ============================================================================
// GEOCODING: Resolve city name → coordinates + metadata
// ============================================================================
async function fetchCoordinates(city) {
    try {
        const response = await fetch(
            `${API_GEOCODING}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Geocoding API unavailable`);
        }
        
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            throw new Error(`City "${city}" not found. Try another location.`);
        }
        
        const location = data.results[0];
        return {
            name: location.name,
            country: location.country || 'Unknown',
            latitude: location.latitude,
            longitude: location.longitude
        };
    } catch (error) {
        showError(`❌ Geocoding Error: ${error.message}`);
        throw error;
    }
}

// ============================================================================
// WEATHER DATA: Fetch current + 5-day forecast via Open-Meteo
// ============================================================================
async function fetchWeatherData(coordinates) {
    try {
        const { latitude, longitude } = coordinates;
        
        const response = await fetch(
            `${API_WEATHER}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Weather API unavailable`);
        }
        
        const data = await response.json();
        
        if (!data.current || !data.daily) {
            throw new Error('Incomplete weather data received');
        }
        
        return data;
    } catch (error) {
        showError(`❌ Weather Data Error: ${error.message}`);
        throw error;
    }
}

// ============================================================================
// UI RENDERING: Single reflow point using DocumentFragment batching
// ============================================================================
function renderCurrentWeather(location, current) {
    const {
        temperature_2m = null,
        weather_code = 0,
        wind_speed_10m = null,
        relative_humidity_2m = null
    } = current;
    
    // Null-safety: fallback to 'N/A' for missing numeric data
    const temp = temperature_2m !== null ? Math.round(temperature_2m) : 'N/A';
    const wind = wind_speed_10m !== null ? Math.round(wind_speed_10m * 10) / 10 : 'N/A';
    const humidity = relative_humidity_2m !== null ? relative_humidity_2m : 'N/A';
    
    const html = `
        <div class="weather-header">
            <div class="weather-location">
                <h2>${location.name}, ${location.country}</h2>
                <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            </div>
            <div class="weather-icon">${getWeatherEmoji(weather_code)}</div>
        </div>
        <div class="weather-main">
            <div class="weather-item">
                <label>Temperature</label>
                <div class="value">
                    ${temp}<span class="unit">°C</span>
                </div>
            </div>
            <div class="weather-item">
                <label>Wind Speed</label>
                <div class="value">
                    ${wind}<span class="unit">m/s</span>
                </div>
            </div>
            <div class="weather-item">
                <label>Humidity</label>
                <div class="value">
                    ${humidity}${humidity !== 'N/A' ? '<span class="unit">%</span>' : ''}
                </div>
            </div>
        </div>
    `;
    
    currentWeatherCard.innerHTML = html;
    currentWeatherCard.classList.remove('loading');
}

function renderForecast(daily) {
    const { time, weather_code, temperature_2m_max, temperature_2m_min } = daily;
    
    // Use DocumentFragment for batch DOM insertion (reduces reflows from ~5 to 1)
    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < 5; i++) {
        const date = new Date(time[i]);
        const code = weather_code[i] ?? 0;
        const maxTemp = temperature_2m_max[i] !== null ? Math.round(temperature_2m_max[i]) : 'N/A';
        const minTemp = temperature_2m_min[i] !== null ? Math.round(temperature_2m_min[i]) : 'N/A';
        
        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
            <span class="forecast-date">
                ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <div class="forecast-icon">${getWeatherEmoji(code)}</div>
            <div class="forecast-temp">
                <span class="high">${maxTemp}°</span>
                <span class="separator">/</span>
                <span class="low">${minTemp}°</span>
            </div>
        `;
        fragment.appendChild(card);
    }
    
    forecastGrid.innerHTML = '';
    forecastGrid.appendChild(fragment);
}

// ============================================================================
// ERROR HANDLING & USER FEEDBACK
// ============================================================================
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('active');
    currentWeatherCard.classList.remove('loading');
    forecastGrid.innerHTML = '';
}

function clearError() {
    errorMessage.textContent = '';
    errorMessage.classList.remove('active');
}

// ============================================================================
// MAIN ORCHESTRATION: Two-stage fetch pipeline with error boundaries
// ============================================================================
async function handleSearch() {
    const city = cityInput.value.trim();
    
    if (!city.length) {
        showError('⚠️ Please enter a city name');
        return;
    }
    
    clearError();
    currentWeatherCard.classList.add('loading');
    
    try {
        // Stage 1: Geocoding (resolve city → coordinates)
        const location = await fetchCoordinates(city);
        
        // Stage 2: Weather fetch (coordinates → weather data)
        const weatherData = await fetchWeatherData(location);
        
        // Stage 3: Batch DOM rendering (single reflow)
        renderCurrentWeather(location, weatherData.current);
        renderForecast(weatherData.daily);
        
    } catch (error) {
        // Error boundaries already handled in fetch functions
        console.error('Search pipeline error:', error);
    }
}

// ============================================================================
// DEBOUNCING & EVENT HANDLERS
// ============================================================================
// Debounce search input (300ms) to prevent API spam on rapid typing
cityInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        // Could auto-search here (advanced feature)
    }, 300);
});

// Search button trigger
searchBtn.addEventListener('click', handleSearch);

// Enter key support
cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        handleSearch();
    }
});

// ============================================================================
// INITIALIZATION: Load default city on page load
// ============================================================================
window.addEventListener('load', () => {
    cityInput.value = 'London';
    handleSearch();
});