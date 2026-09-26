import Map, { Marker, Popup } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';
import Navbar from '../components/Navbar';
import { useState, useRef, useEffect } from 'react';
import MapSidebar from '../components/MapSidebar';
import { supabase } from '../supabaseClient';


function TravelMap() {

    
    //keeps track of whether the sidebar is open or closed. 
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const [addingPin, setAddingPin] = useState(false);
    const [newPin, setNewPin] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const mapRef = useRef(null);
    const [searchResults, setSearchResults] = useState([]);
    const [pinName, setPinName] = useState('');
    const [selectedMaps, setSelectedMaps] = useState([]);
    const [expandedPinMaps, setExpandedPinMaps] = useState([]);
    const [pins, setPins] = useState([]);
    const [selectedPin, setSelectedPin] = useState(null);
    const [editingPin, setEditingPin] = useState(null);
    const [pinNotes, setPinNotes] = useState('');
    const [deletingPin, setDeletingPin] = useState(null);
    const [checkingUser, setCheckingUser] = useState(true);

    useEffect(() => {
        const loadMaps = async () => {
            const { data: userData } = await supabase.auth.getUser();

            if (!userData.user) {
                window.location.href = '/login';
                return;
            }

            const userId = userData.user.id;

            const { data: mapData, error: mapError } = await supabase
                .from('maps')
                .select('*')
                .eq('user_id', userId)
                .order('sort_order', { ascending: true });

            if (mapError) {
                console.error('Error loading maps:', mapError);
                setLoadingMaps(false);
                setCheckingUser(false);
                return;
            }

            // If this user has no maps yet, create their default maps.
            const hasAllPlaces = mapData.some(
                map => map.name === 'All Places' && map.is_default === true
            );

            if (!hasAllPlaces) {
                const { data: newMaps, error: insertError } = await supabase
                    .from('maps')
                    .insert([
                        {
                            user_id: userId,
                            name: 'All Places',
                            color: '#333',
                            is_default: true,
                            sort_order: 0
                        },
                        {
                            user_id: userId,
                            name: 'My places',
                            color: '#ff0000',
                            is_default: false,
                            sort_order: 1
                        },
                        {
                            user_id: userId,
                            name: 'Family',
                            color: '#007ba0',
                            is_default: false,
                            sort_order: 2
                        }
                    ])
                    .select();

                if (insertError) {
                    console.error('Error creating default maps:', insertError);
                    setLoadingMaps(false);
                    setCheckingUser(false);
                    return;
                }

                const familyMap = newMaps.find(
                    map => map.name === 'Family'
                );

                if (familyMap) {
                    const { data: newSubmaps, error: submapError } = await supabase
                        .from('submaps')
                        .insert([
                            {
                                map_id: familyMap.id,
                                name: 'Mom',
                                color: '#eb877b',
                                sort_order: 0
                            },
                            {
                                map_id: familyMap.id,
                                name: 'Dad',
                                color: '#858626',
                                sort_order: 1
                            },
                            {
                                map_id: familyMap.id,
                                name: 'Sister',
                                color: '#2ecc71',
                                sort_order: 2
                            }
                        ])
                        .select();

                    if (submapError) {
                        console.error('Error creating default submaps:', submapError);
                    }

                    setMaps(
                        newMaps.map(map => ({
                            id: map.id,
                            name: map.name,
                            visible: false,
                            isDefault: map.is_default,
                            color: map.color,
                            submaps: map.id === familyMap.id
                                ? newSubmaps.map(submap => ({
                                    id: submap.id,
                                    name: submap.name,
                                    visible: false,
                                    color: submap.color
                                }))
                                : []
                        }))
                    );
                }
            } else {
                // Load existing maps and their submaps.
                const { data: submapData, error: submapError } = await supabase
                    .from('submaps')
                    .select('*')
                    .order('sort_order', { ascending: true });

                if (submapError) {
                    console.error('Error loading submaps:', submapError);
                }

                setMaps(
                    mapData.map(map => ({
                        id: map.id,
                        name: map.name,
                        visible: false,
                        isDefault: map.is_default,
                        color: map.color,
                        submaps: (submapData || [])
                            .filter(submap => submap.map_id === map.id)
                            .map(submap => ({
                                id: submap.id,
                                name: submap.name,
                                visible: false,
                                color: submap.color
                            }))
                    }))
                );
            }

            setLoadingMaps(false);
            setCheckingUser(false);
        };

        loadMaps();
    }, []);

    const getMapSelectionId = (id) => `map:${id}`;
    const getSubmapSelectionId = (id) => `submap:${id}`;

    const loadPins = async () => {
        const { data: userData, error: userError } =
            await supabase.auth.getUser();

        if (userError || !userData.user) {
            console.error('Error getting user:', userError);
            return;
        }

        const userId = userData.user.id;

        // Get all pins belonging to this user
        const { data: pinData, error: pinError } = await supabase
            .from('pins')
            .select('*')
            .eq('user_id', userId);

        if (pinError) {
            console.error('Error loading pins:', JSON.stringify(pinError, null, 2));
            return;
        }

        if (pinData.length === 0) {
            setPins([]);
            return;
        }

        // Get the map/submap connections for these pins
        const { data: pinMapData, error: pinMapError } = await supabase
            .from('pin_maps')
            .select('*')
            .in(
                'pin_id',
                pinData.map(pin => pin.id)
            );

        if (pinMapError) {
            console.error('Error loading pin map connections:', pinMapError);
            return;
        }

        const loadedPins = pinData.map(pin => ({
            id: pin.id,
            name: pin.name,
            longitude: pin.longitude,
            latitude: pin.latitude,
            notes: pin.notes || '',
            maps: pinMapData
                .filter(connection => connection.pin_id === pin.id)
                .map(connection => {
                    if (connection.map_id !== null) {
                        return getMapSelectionId(connection.map_id);
                    }

                    return getSubmapSelectionId(connection.submap_id);
                })
        }));

        setPins(loadedPins);
    };

    useEffect(() => {
        loadPins();
    }, []);

    useEffect(() => {
        const map = mapRef.current?.getMap();

        if (!map) return;

        map.getCanvas().style.cursor = addingPin ? 'crosshair' : '';
    }, [addingPin]);

    /*
    Stores the maps that the user has available.
    "visible" determines whether that map's locations should appear.
    "isDefault" identifies built-in maps such as "All Places" which cannot be renamed or deleted.
    */
    const [maps, setMaps] = useState([]);
    const [loadingMaps, setLoadingMaps] = useState(true);
    
    const togglePinMap = (id) => {
        setSelectedMaps(prev => {
            const selected = new Set(prev);

            const clickedMap = maps.find(map => map.id === id);

            if (!clickedMap) {
                return [...selected];
            }

            // All Places selects or deselects everything
            if (clickedMap.isDefault) {
                const allIds = maps.flatMap(map => [
                    getMapSelectionId(map.id),
                    ...map.submaps.map(submap =>
                        getSubmapSelectionId(submap.id)
                    )
                ]);

                const everythingSelected = allIds.every(
                    selectionId => selected.has(selectionId)
                );

                return everythingSelected ? [] : allIds;
            }

            const mapSelectionId = getMapSelectionId(id);

            // If this map has submaps, select/deselect
            // the parent and all of its children
            if (clickedMap.submaps.length > 0) {
                const ids = [
                    mapSelectionId,
                    ...clickedMap.submaps.map(submap =>
                        getSubmapSelectionId(submap.id)
                    )
                ];

                const parentSelected = selected.has(mapSelectionId);

                if (parentSelected) {
                    ids.forEach(selectionId => selected.delete(selectionId));
                } else {
                    ids.forEach(selectionId => selected.add(selectionId));
                }
            } else {
                // Regular map
                if (selected.has(mapSelectionId)) {
                    selected.delete(mapSelectionId);
                } else {
                    selected.add(mapSelectionId);
                }
            }

            // Check whether every map and submap is selected
            const allIds = maps
                .filter(map => !map.isDefault)
                .flatMap(map => [
                    getMapSelectionId(map.id),
                    ...map.submaps.map(submap =>
                        getSubmapSelectionId(submap.id)
                    )
                ]);

            const everythingSelected = allIds.every(
                selectionId => selected.has(selectionId)
            );

            // All Places should be checked whenever
            // everything else is checked
            const allPlacesId = maps.find(map => map.isDefault)?.id;

            if (allPlacesId !== undefined) {
                const allPlacesSelectionId = getMapSelectionId(allPlacesId);

                if (everythingSelected) {
                    selected.add(allPlacesSelectionId);
                } else {
                    selected.delete(allPlacesSelectionId);
                }
            }

            return [...selected];
        });
    };

    const togglePinMapExpand = (id) => {
        setExpandedPinMaps(prev =>
            prev.includes(id)
                ? prev.filter(mapId => mapId !== id)
                : [...prev, id]
        );
    };

    const togglePinSubmap = (mapId, submapId) => {
        setSelectedMaps(prev => {
            const selected = new Set(prev);

            const submapSelectionId = getSubmapSelectionId(submapId);

            // Toggle the clicked submap
            if (selected.has(submapSelectionId)) {
                selected.delete(submapSelectionId);
            } else {
                selected.add(submapSelectionId);
            }

            const parentMap = maps.find(map => map.id === mapId);

            if (!parentMap) {
                return [...selected];
            }

            // Check whether all of this parent's submaps are selected
            const allSubmapsSelected = parentMap.submaps.every(
                submap => selected.has(getSubmapSelectionId(submap.id))
            );

            const parentSelectionId = getMapSelectionId(mapId);

            // Select or deselect the parent based on its children
            if (allSubmapsSelected) {
                selected.add(parentSelectionId);
            } else {
                selected.delete(parentSelectionId);
            }

            // Check whether everything is selected
            const allIds = maps
                .filter(map => !map.isDefault)
                .flatMap(map => [
                    getMapSelectionId(map.id),
                    ...map.submaps.map(submap =>
                        getSubmapSelectionId(submap.id)
                    )
                ]);

            const everythingSelected = allIds.every(
                selectionId => selected.has(selectionId)
            );

            // If everything is selected, also select All Places
            const allPlacesId = maps.find(map => map.isDefault)?.id;

            if (allPlacesId !== undefined) {
                const allPlacesSelectionId = getMapSelectionId(allPlacesId);

                if (everythingSelected) {
                    selected.add(allPlacesSelectionId);
                } else {
                    selected.delete(allPlacesSelectionId);
                }
            }

            return [...selected];
        });
    };

    const getPinColor = (pin) => {
        for (const selectionId of pin.maps) {
            if (selectionId.startsWith('submap:')) {
                const submapId = Number(selectionId.replace('submap:', ''));

                for (const map of maps) {
                    const submap = map.submaps.find(
                        submap => submap.id === submapId
                    );

                    if (submap) {
                        return submap.color;
                    }
                }
            }

            if (selectionId.startsWith('map:')) {
                const mapId = Number(selectionId.replace('map:', ''));
                const map = maps.find(map => map.id === mapId);

                if (map && !map.isDefault) {
                    return map.color;
                }
            }
        }

        return '#3388ff';
    };

    const isPinVisible = (pin) => {
        if (maps.find(map => map.isDefault)?.visible) {
            return true;
        }

        return pin.maps.some(selectionId => {
            if (selectionId.startsWith('map:')) {
                const mapId = Number(selectionId.replace('map:', ''));
                const map = maps.find(map => map.id === mapId);

                return map ? map.visible : false;
            }

            if (selectionId.startsWith('submap:')) {
                const submapId = Number(selectionId.replace('submap:', ''));

                return maps.some(map =>
                    map.submaps.some(
                        submap =>
                            submap.id === submapId && submap.visible
                    )
                );
            }

            return false;
        });
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    if (checkingUser || loadingMaps) {
        return <p>Loading...</p>;
    }

    return (
        <>
            <Navbar />

            <div className="map-page">

                {/* Sidebar component that allows users to toggle visibility of maps and rename them. */}
                <MapSidebar 
                    isOpen={sidebarOpen} 
                    setIsOpen={setSidebarOpen} 
                    maps={maps}
                    setMaps={setMaps}
                />

                <div className="map-wrapper">
                    {addingPin && (
                        <div className="pin-search">
                            <input
                                type="text"
                                placeholder="Search for a place..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                            />
                            <button
                                onClick={async () => {
                                if (!searchQuery.trim()) return;

                                const response = await fetch(
                                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
                                );

                                const results = await response.json();

                                setSearchResults(results);
                            }}
                            >
                                Search
                            </button>

                            {searchResults.length > 0 && (
                                <div className="search-results">
                                    {searchResults.slice(0, 5).map((result) => (
                                        <button
                                            key={result.place_id}
                                            onClick={() => {
                                                const south = parseFloat(result.boundingbox[0]);
                                                const north = parseFloat(result.boundingbox[1]);
                                                const west = parseFloat(result.boundingbox[2]);
                                                const east = parseFloat(result.boundingbox[3]);

                                                const latitudeSpan = Math.abs(north - south);
                                                const longitudeSpan = Math.abs(east - west);

                                                const largestSpan = Math.max(latitudeSpan, longitudeSpan);

                                                let zoomLevel;

                                                if (largestSpan > 30) {
                                                    zoomLevel = 3;
                                                } else if (largestSpan > 10) {
                                                    zoomLevel = 5;
                                                } else if (largestSpan > 3) {
                                                    zoomLevel = 7;
                                                } else if (largestSpan > 1) {
                                                    zoomLevel = 9;
                                                } else if (largestSpan > 0.2) {
                                                    zoomLevel = 12;
                                                } else if (largestSpan > 0.05) {
                                                    zoomLevel = 14;
                                                } else {
                                                    zoomLevel = 17;
                                                }

                                                mapRef.current?.flyTo({
                                                    center: [
                                                        parseFloat(result.lon),
                                                        parseFloat(result.lat)
                                                    ],
                                                    zoom: zoomLevel,
                                                    duration: 1500
                                                });

                                                setSearchResults([]);
                                            }}
                                        >
                                            {result.display_name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Main map component that displays the map using MapLibre GL. */}
                    <Map ref={mapRef} className="map-container"
                        initialViewState={{
                            longitude: -30,
                            latitude: 30,
                            zoom: 2,
                        }}
                        style={{
                            width: '100%',
                            height: '100%'
                        }}
                        mapStyle="https://tiles.openfreemap.org/styles/fiord"
                        onClick={(event) => {
                            if (!addingPin) return;
                            setNewPin({
                                longitude: event.lngLat.lng,
                                latitude: event.lngLat.lat
                            });
                            setAddingPin(false);
                            setPinName('');
                            setSelectedMaps([]);
                        }}
                    >
                        {newPin && (
                            <Marker
                                longitude={newPin.longitude}
                                latitude={newPin.latitude}
                            />
                        )}
                        
                        {pins.filter(isPinVisible).map(pin => (
                            <Marker
                                key={pin.id}
                                longitude={pin.longitude}
                                latitude={pin.latitude}
                            >
                                <div
                                    className="saved-pin-marker"
                                    style={{
                                        backgroundColor: getPinColor(pin)
                                    }}
                                    title={pin.name}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedPin(pin);
                                    }}
                                />
                            </Marker>
                        ))}

                        {selectedPin && (
                            <Popup
                                longitude={selectedPin.longitude}
                                latitude={selectedPin.latitude}
                                onClose={() => setSelectedPin(null)}
                                closeButton={true}
                                anchor="bottom"
                            >
                                <div className="pin-popup">
                                    <strong>{selectedPin.name}</strong>

                                    {selectedPin.notes && (
                                        <div className="pin-popup-notes">
                                            <span>Notes:</span>
                                            <p>{selectedPin.notes}</p>
                                        </div>
                                    )}

                                    <div className="pin-popup-maps">
                                        <span>Maps:</span>

                                        {maps
                                            .filter(map => !map.isDefault)
                                            .map(map => {
                                                const selectedSubmaps = map.submaps.filter(submap =>
                                                    selectedPin.maps.includes(getSubmapSelectionId(submap.id))
                                                );

                                                const mapSelected = selectedPin.maps.includes(
                                                    getMapSelectionId(map.id)
                                                );

                                                if (!mapSelected && selectedSubmaps.length === 0) {
                                                    return null;
                                                }

                                                return (
                                                    <div key={map.id} className="pin-popup-map">
                                                        <div
                                                            className="pin-popup-map-name"
                                                            style={{ color: map.color }}
                                                        >
                                                            {map.name}
                                                        </div>

                                                        {selectedSubmaps.length > 0 && (
                                                            <div className="pin-popup-submaps">
                                                                {selectedSubmaps.map(submap => (
                                                                    <div
                                                                        key={submap.id}
                                                                        className="pin-popup-submap-name"
                                                                        style={{ color: submap.color }}
                                                                    >
                                                                        {submap.name}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        
                                                    </div>

                                                    
                                                );
                                            })}
                                    </div>

                                    <div className="pin-popup-buttons">
                                        <button
                                            className="pin-edit-button"
                                            onClick={() => {
                                                setEditingPin(selectedPin);
                                                setPinName(selectedPin.name);
                                                setSelectedMaps(selectedPin.maps);
                                                setSelectedPin(null);
                                                setPinNotes(selectedPin.notes || '');
                                            }}
                                        >
                                            Edit Pin
                                        </button>

                                        <button
                                            className="pin-delete-button"
                                            onClick={() => {
                                                setDeletingPin(selectedPin);
                                                setSelectedPin(null);
                                            }}
                                        >
                                            Delete Pin
                                        </button>
                                    </div>
                                </div>
                            </Popup>
                        )}
                    </Map>

                    {(newPin || editingPin) && (
                        <div className="pin-details-overlay">
                            <div className="pin-details-popup">
                                <h3>{editingPin ? 'Edit Pin' : 'Add Pin'}</h3>

                                <input
                                    type="text"
                                    placeholder="Enter place name"
                                    value={pinName}
                                    onChange={(event) => setPinName(event.target.value)}
                                />
                                <h4>Notes</h4>
                                <textarea
                                    placeholder="Add notes about this place..."
                                    value={pinNotes}
                                    onChange={(event) => setPinNotes(event.target.value)}
                                    rows={4}
                                />

                                <h4>Choose Maps</h4>

                                <div className="pin-map-list">
                                    {maps.map((map) => (
                                        <div key={map.id}>

                                            {/* Parent map */}
                                            <div className="pin-map-item">

                                                <div className="pin-dropdown-container">
                                                    <button
                                                        className={`pin-dropdown-button ${
                                                            map.submaps.length === 0
                                                                ? 'pin-dropdown-button-hidden'
                                                                : ''
                                                        }`}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            togglePinMapExpand(map.id);
                                                        }}
                                                    >
                                                        {expandedPinMaps.includes(map.id) ? '▾' : '▸'}
                                                    </button>
                                                </div>

                                                <input
                                                    type="checkbox"
                                                    checked={selectedMaps.includes(getMapSelectionId(map.id))}
                                                    onChange={() => togglePinMap(map.id)}
                                                />

                                                <span
                                                    className="pin-map-name"
                                                    style={{ color: map.color }}
                                                >
                                                    {map.name}
                                                </span>

                                            </div>

                                            {/* Submaps */}
                                            {expandedPinMaps.includes(map.id) && (
                                                <div className="pin-submap-list">
                                                    {map.submaps.map((submap) => (
                                                        <div
                                                            key={submap.id}
                                                            className="pin-submap-item"
                                                        >
                                                            <div className="pin-submap-spacer"></div>

                                                            <input
                                                                type="checkbox"
                                                                checked={selectedMaps.includes(getSubmapSelectionId(submap.id))}
                                                                onChange={() => togglePinSubmap(
                                                                    map.id,
                                                                    submap.id
                                                                )}
                                                            />

                                                            <span
                                                                className="pin-submap-name"
                                                                style={{ color: submap.color }}
                                                            >
                                                                {submap.name}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                        </div>
                                    ))}
                                </div>

                                <div className="pin-details-buttons">
                                    <button
                                        onClick={() => {
                                            setNewPin(null);
                                            setEditingPin(null);
                                            setPinName('');
                                            setSelectedMaps([]);
                                            setPinNotes('');
                                        }}
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        onClick={async () => {
                                            if (pinName.trim() === '') {
                                                alert('Please enter a name for the pin.');
                                                return;
                                            }

                                            if (selectedMaps.length === 0) {
                                                alert('Please select at least one map.');
                                                return;
                                            }

                                            if (editingPin) {
                                                const { error: pinError } = await supabase
                                                    .from('pins')
                                                    .update({
                                                        name: pinName.trim(),
                                                        notes: pinNotes.trim()
                                                    })
                                                    .eq('id', editingPin.id);

                                                if (pinError) {
                                                    console.error(
                                                        'Error updating pin:',
                                                        JSON.stringify(pinError, null, 2)
                                                    );
                                                    alert('Could not update the pin.');
                                                    return;
                                                }

                                                const { error: deleteMapError } = await supabase
                                                    .from('pin_maps')
                                                    .delete()
                                                    .eq('pin_id', editingPin.id);

                                                if (deleteMapError) {
                                                    console.error(
                                                        'Error removing old pin maps:',
                                                        JSON.stringify(deleteMapError, null, 2)
                                                    );
                                                    alert('Could not update the pin maps.');
                                                    return;
                                                }

                                                const pinMapRows = selectedMaps
                                                    .filter(selectionId => {
                                                        if (selectionId.startsWith('map:')) {
                                                            const mapId = Number(
                                                                selectionId.replace('map:', '')
                                                            );

                                                            const map = maps.find(map => map.id === mapId);

                                                            return map && !map.isDefault;
                                                        }

                                                        return true;
                                                    })
                                                    .map(selectionId => {
                                                        if (selectionId.startsWith('map:')) {
                                                            return {
                                                                pin_id: editingPin.id,
                                                                map_id: Number(
                                                                    selectionId.replace('map:', '')
                                                                ),
                                                                submap_id: null
                                                            };
                                                        }

                                                        return {
                                                            pin_id: editingPin.id,
                                                            map_id: null,
                                                            submap_id: Number(
                                                                selectionId.replace('submap:', '')
                                                            )
                                                        };
                                                    });

                                                if (pinMapRows.length > 0) {
                                                    const { error: pinMapError } = await supabase
                                                        .from('pin_maps')
                                                        .insert(pinMapRows);

                                                    if (pinMapError) {
                                                        console.error(
                                                            'Error updating pin maps:',
                                                            JSON.stringify(pinMapError, null, 2)
                                                        );
                                                        alert('Could not save the pin maps.');
                                                        return;
                                                    }
                                                }

                                                setPins(prevPins =>
                                                    prevPins.map(pin =>
                                                        pin.id === editingPin.id
                                                            ? {
                                                                ...pin,
                                                                name: pinName.trim(),
                                                                notes: pinNotes.trim(),
                                                                maps: selectedMaps
                                                            }
                                                            : pin
                                                    )
                                                );
                                            } else {
                                                const { data: userData, error: userError } =
                                                    await supabase.auth.getUser();

                                                if (userError || !userData.user) {
                                                    alert('You must be logged in to create a pin.');
                                                    return;
                                                }

                                                // Create the pin itself
                                                const { data: newPinData, error: pinError } = await supabase
                                                    .from('pins')
                                                    .insert({
                                                        user_id: userData.user.id,
                                                        name: pinName.trim(),
                                                        longitude: newPin.longitude,
                                                        latitude: newPin.latitude,
                                                        notes: pinNotes.trim()
                                                    })
                                                    .select()
                                                    .single();

                                                if (pinError) {
                                                    console.error('Error creating pin:', pinError);
                                                    alert('Could not save the pin.');
                                                    return;
                                                }

                                                // Convert the selected map/submap IDs into database rows
                                                const pinMapRows = selectedMaps
                                                    .filter(selectionId => {
                                                        // All Places is only a selection shortcut.
                                                        // We don't save it as a pin connection.
                                                        if (selectionId.startsWith('map:')) {
                                                            const mapId = Number(selectionId.replace('map:', ''));
                                                            const map = maps.find(map => map.id === mapId);

                                                            return map && !map.isDefault;
                                                        }

                                                        return true;
                                                    })
                                                    .map(selectionId => {
                                                        if (selectionId.startsWith('map:')) {
                                                            return {
                                                                pin_id: newPinData.id,
                                                                map_id: Number(selectionId.replace('map:', '')),
                                                                submap_id: null
                                                            };
                                                        }

                                                        return {
                                                            pin_id: newPinData.id,
                                                            map_id: null,
                                                            submap_id: Number(
                                                                selectionId.replace('submap:', '')
                                                            )
                                                        };
                                                    });

                                                const { error: pinMapError } = await supabase
                                                    .from('pin_maps')
                                                    .insert(pinMapRows);

                                                if (pinMapError) {
                                                    console.error(
                                                        'Error creating pin map connections:',
                                                        pinMapError
                                                    );

                                                    // Remove the pin if its connections could not be saved.
                                                    await supabase
                                                        .from('pins')
                                                        .delete()
                                                        .eq('id', newPinData.id);

                                                    alert('Could not save the pin maps.');
                                                    return;
                                                }

                                                const pin = {
                                                    id: newPinData.id,
                                                    name: newPinData.name,
                                                    longitude: newPinData.longitude,
                                                    latitude: newPinData.latitude,
                                                    notes: newPinData.notes || '',
                                                    maps: selectedMaps
                                                };

                                                setPins(prevPins => [...prevPins, pin]);
                                            }

                                            setNewPin(null);
                                            setPinName('');
                                            setSelectedMaps([]);
                                            setEditingPin(null);
                                            setPinNotes('');
                                        }}
                                    >
                                        Save Pin
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {deletingPin && (
                        <div className="pin-details-overlay">
                            <div className="pin-details-popup">
                                <h3>Delete Pin</h3>

                                <p>
                                    Are you sure you want to delete "{deletingPin.name}"?
                                </p>

                                <div className="pin-details-buttons">
                                    <button
                                        onClick={() => {
                                            setDeletingPin(null);
                                        }}
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        className="pin-delete-button"
                                        onClick={async () => {
                                            const { error: pinError } = await supabase
                                            .from('pins')
                                            .delete()
                                            .eq('id', deletingPin.id);

                                        if (pinError) {
                                            console.error(
                                                'Error deleting pin:',
                                                JSON.stringify(pinError, null, 2)
                                            );
                                            alert('Could not delete the pin.');
                                            return;
                                        }

                                        setPins(prevPins =>
                                            prevPins.filter(pin => pin.id !== deletingPin.id)
                                        );

                                        setDeletingPin(null);

                                        }}
                                    >
                                        Delete Pin
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    <button 
                        className="add-pin-button" 
                        onClick={() => {
                            setAddingPin(!addingPin)
                            setNewPin(null);
                        }}
                    >
                        {addingPin ? 'Cancel Add Pin' : '+ Add Pin'}
                    </button>
                </div>
            </div>
        </>
    );
}

export default TravelMap;