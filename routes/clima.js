// routes/clima.js
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const apiKey = process.env.WEATHER_API_KEY;
  const city = process.env.WEATHER_CITY || 'Mexico City';
  const country = process.env.WEATHER_COUNTRY || 'MX';

  if (!apiKey || apiKey === 'tu_api_key_aqui') {
    return res.json({
      ok: true,
      data: { descripcion: 'Configure WEATHER_API_KEY en .env', temp: '--', icono: '🌤️' }
    });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},${country}&appid=${apiKey}&units=metric&lang=es`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.cod !== 200) {
      return res.json({ ok: false, data: { descripcion: 'No disponible', temp: '--', icono: '🌤️' } });
    }

    const iconMap = {
      '01': '☀️', '02': '⛅', '03': '☁️', '04': '☁️',
      '09': '🌧️', '10': '🌦️', '11': '⛈️', '13': '❄️', '50': '🌫️'
    };
    const iconCode = data.weather[0].icon.slice(0, 2);

    res.json({
      ok: true,
      data: {
        ciudad: data.name,
        descripcion: data.weather[0].description,
        temp: Math.round(data.main.temp),
        sensacion: Math.round(data.main.feels_like),
        humedad: data.main.humidity,
        icono: iconMap[iconCode] || '🌤️'
      }
    });
  } catch (err) {
    res.json({ ok: false, data: { descripcion: 'Sin conexión', temp: '--', icono: '🌤️' } });
  }
});

module.exports = router;
