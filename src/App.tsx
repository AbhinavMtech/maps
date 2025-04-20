import { useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Box, TextField, Button, Paper, Typography, Alert, List, ListItem, ListItemText, Tabs, Tab } from '@mui/material';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './App.css';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom airport icon
const airportIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface Coordinates {
  lat: number;
  lng: number;
}

interface RouteStep {
  instruction: string;
  distance: number;
}

function RouteMap({ from, to, setError, setDirections }: { 
  from: string; 
  to: string; 
  setError: (error: string | null) => void;
  setDirections: (steps: RouteStep[]) => void;
}) {
  const map = useMap();

  const getCoordinates = async (address: string): Promise<Coordinates | null> => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      const data = await response.json();
      if (data && data[0]) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
      throw new Error('Location not found');
    } catch (error) {
      console.error('Error getting coordinates:', error);
      setError('Error finding location. Please try a different address.');
      return null;
    }
  };

  const getRoute = async (start: Coordinates, end: Coordinates) => {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&steps=true`
      );
      const data = await response.json();
      
      if (data.code !== 'Ok') {
        throw new Error('Route not found');
      }

      // Extract turn-by-turn directions
      const steps = data.routes[0].legs[0].steps.map((step: any) => ({
        instruction: step.maneuver.instruction || step.name,
        distance: Math.round(step.distance)
      }));
      
      setDirections(steps);
      
      return data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
    } catch (error) {
      console.error('Error getting route:', error);
      setError('Error finding route. Please try again.');
      return null;
    }
  };

  const updateRoute = async () => {
    const fromCoords = await getCoordinates(from);
    const toCoords = await getCoordinates(to);

    if (fromCoords && toCoords) {
      // Clear existing markers and route
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
          map.removeLayer(layer);
        }
      });

      // Get the actual road route
      const routeCoordinates = await getRoute(fromCoords, toCoords);
      
      if (routeCoordinates) {
        // Add markers
        L.marker([fromCoords.lat, fromCoords.lng])
          .addTo(map)
          .bindPopup('Start: ' + from);
        
        L.marker([toCoords.lat, toCoords.lng])
          .addTo(map)
          .bindPopup('End: ' + to);

        // Draw the actual road route
        const routeLine = L.polyline(routeCoordinates, {
          color: '#2196F3',
          weight: 5
        }).addTo(map);

        // Fit the map to show the entire route
        map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

        // Calculate actual road distance
        const distance = routeCoordinates.reduce((total: number, coord: [number, number], i: number) => {
          if (i === 0) return 0;
          return total + map.distance(routeCoordinates[i - 1], coord);
        }, 0);

        if (distance > 100000) { // 100km
          // Example airports (you would typically fetch these from an API)
          const airports = [
            { name: 'DFW', coords: [32.8998, -97.0403] as [number, number] },
            { name: 'DAL', coords: [32.8481, -96.8512] as [number, number] },
          ];

          airports.forEach(airport => {
            L.marker(airport.coords, { icon: airportIcon })
              .addTo(map)
              .bindPopup(airport.name + ' Airport');
          });
        }
      }
    }
  };

  if (from && to) {
    updateRoute();
  }

  return null;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function App() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [directions, setDirections] = useState<RouteStep[]>([]);
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleSubmit = () => {
    if (!origin || !destination) {
      setError('Please enter both origin and destination');
      return;
    }
    setError(null);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, margin: '0 auto' }}>
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Map Navigation
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexDirection: { xs: 'column', md: 'row' } }}>
          <TextField
            fullWidth
            label="Origin"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            error={!origin && !!error}
          />
          <TextField
            fullWidth
            label="Destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            error={!destination && !!error}
          />
          <Button 
            variant="contained" 
            onClick={handleSubmit}
            sx={{ height: { md: '56px' } }}
          >
            Get Directions
          </Button>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      <Box sx={{ width: '100%', mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label="Map" />
            <Tab label="Directions" />
          </Tabs>
        </Box>
        
        <TabPanel value={tabValue} index={0}>
          <Paper elevation={3} sx={{ height: '70vh', overflow: 'hidden' }}>
            <MapContainer
              center={[40.7128, -74.0060]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <RouteMap 
                from={origin} 
                to={destination} 
                setError={setError}
                setDirections={setDirections}
              />
            </MapContainer>
          </Paper>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Paper elevation={3} sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            {directions.length > 0 ? (
              <List>
                {directions.map((step, index) => (
                  <ListItem key={index} divider={index !== directions.length - 1}>
                    <ListItemText
                      primary={step.instruction}
                      secondary={`${step.distance} meters`}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  Enter a destination and click "Get Directions" to see turn-by-turn directions
                </Typography>
              </Box>
            )}
          </Paper>
        </TabPanel>
      </Box>
    </Box>
  );
}

export default App;
