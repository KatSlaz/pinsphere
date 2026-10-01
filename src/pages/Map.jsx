import Map, { Marker, Popup } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';
import Navbar from '../components/Navbar';
import { useState, useRef, useEffect, useCallback } from 'react';
import MapSidebar from '../components/MapSidebar';
import { supabase } from '../supabaseClient';

const getMapSelectionId = (id) => `map:${id}`;
const getSubmapSelectionId = (id) => `submap:${id}`;
const canEditMap = (map) => map?.role === 'owner' || map?.role === 'editor';
const canEditPinInMaps = (pin, maps) => maps.some(map => canEditMap(map) && (
    pin.maps.includes(getMapSelectionId(map.id)) ||
    map.submaps.some(submap => pin.maps.includes(getSubmapSelectionId(submap.id)))
));

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
    const [canDeleteEverywhere, setCanDeleteEverywhere] = useState(null);
    const [deletePermissionError, setDeletePermissionError] = useState('');
    const [pinActionPending, setPinActionPending] = useState(false);
    const pinActionRef = useRef(false);
    const deleteCheckRef = useRef(0);
    const [checkingUser, setCheckingUser] = useState(true);
    const [leavingMapId, setLeavingMapId] = useState(null);
    const leavingMapRef = useRef(false);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [maps, setMaps] = useState([]);
    const [loadingMaps, setLoadingMaps] = useState(true);
    const pinLoadRef = useRef(0);

    const loadPins = useCallback(async (accessMaps) => {
        const requestId = ++pinLoadRef.current;
        const { data: userData, error: userError } =
            await supabase.auth.getUser();

        if (userError || !userData.user) {
            console.error('Error getting user:', userError);
            return;
        }

        const userId = userData.user.id;
        if (requestId !== pinLoadRef.current) return;
        setCurrentUserId(userId);

        // RLS returns personal pins and pins on accessible shared maps.
        const { data: pinData, error: pinError } = await supabase
            .from('pins')
            .select('*');

        if (requestId !== pinLoadRef.current) return;

        if (pinError) {
            console.error('Error loading pins:', JSON.stringify(pinError, null, 2));
            return;
        }

        if (pinData.length === 0) {
            setPins([]);
            setSelectedPin(null);
            setEditingPin(null);
            setDeletingPin(null);
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
            userId: pin.user_id,
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

        if (requestId !== pinLoadRef.current) return;
        setPins(loadedPins);
        setSelectedPin(prev => prev ? loadedPins.find(pin => pin.id === prev.id) || null : null);
        setEditingPin(prev => prev && loadedPins.some(pin => pin.id === prev.id && canEditPinInMaps(pin, accessMaps)) ? prev : null);
        setDeletingPin(prev => prev && loadedPins.some(pin => pin.id === prev.id && (
            canEditPinInMaps(pin, accessMaps) || pin.maps.length === 0 && pin.userId === userId
        )) ? prev : null);
    }, []);

    useEffect(() => {
        const loadMaps = async () => {
            const { data: userData } = await supabase.auth.getUser();

            if (!userData.user) {
                window.location.href = '/login';
                return;
            }

            const userId = userData.user.id;

            const { data: collaboratorData, error: collaboratorError } = await supabase
                .from('map_collaborators')
                .select('map_id, role')
                .eq('user_id', userId);

            if (collaboratorError) {
                console.error(
                    'Error loading collaborator roles:',
                    JSON.stringify(collaboratorError, null, 2)
                );
            }

            const { data: mapData, error: mapError } = await supabase
                .from('maps')
                .select('*')
                .order('sort_order', { ascending: true });

            if (mapError) {
                console.error('Error loading maps:', mapError);
                setLoadingMaps(false);
                setCheckingUser(false);
                return;
            }

            // If this user has no maps yet, create their default maps.
            const hasAllPlaces = mapData.some(
                map =>
                    map.user_id === userId &&
                    map.name === 'All Places' &&
                    map.is_default === true
            );

            if (!hasAllPlaces) {
                const { error: insertError } = await supabase
                    .from('maps')
                    .upsert(
                        [
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
                        ],
                        {
                            onConflict: 'user_id,name',
                            ignoreDuplicates: true
                        }
                    );

                if (insertError) {
                    console.error('Error creating default maps:', insertError);
                    setLoadingMaps(false);
                    setCheckingUser(false);
                    return;
                }

                const { data: familyMap, error: familyMapError } = await supabase
                    .from('maps')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('name', 'Family')
                    .single();

                if (familyMapError) {
                    console.error('Error loading Family map:', familyMapError);
                }

                if (familyMap) {
                    const { error: submapError } = await supabase
                        .from('submaps')
                        .upsert(
                            [
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
                            ],
                            {
                                onConflict: 'map_id,name',
                                ignoreDuplicates: true
                            }
                        );

                    if (submapError) {
                        console.error('Error creating default submaps:', submapError);
                    }
                }
            }

            const { data: finalMapData, error: finalMapError } = await supabase
                .from('maps')
                .select('*')
                .order('sort_order', { ascending: true });

            if (finalMapError) {
                console.error('Error loading maps:', finalMapError);
                setLoadingMaps(false);
                setCheckingUser(false);
                return;
            }

            const { data: submapData, error: submapError } = await supabase
                .from('submaps')
                .select('*')
                .order('sort_order', { ascending: true });

            if (submapError) {
                console.error('Error loading submaps:', submapError);
            }

            console.log('Current user ID:', userId);
            console.log('Maps from Supabase:', finalMapData);
            console.log('Collaborators:', collaboratorData);
            const loadedMaps = finalMapData.map(map => {
                    const collaborator = (collaboratorData || []).find(
                        item => item.map_id === map.id
                    );

                    return {
                        id: map.id,
                        name: map.name,
                        visible: false,
                        isDefault: map.is_default,
                        color: map.color,
                        role: map.user_id === userId
                            ? 'owner'
                            : collaborator?.role || 'viewer',
                        submaps: (submapData || [])
                            .filter(submap => submap.map_id === map.id)
                            .map(submap => ({
                                id: submap.id,
                                name: submap.name,
                                visible: false,
                                color: submap.color
                        }))
            }});
            setMaps(loadedMaps);

            setLoadingMaps(false);
            setCheckingUser(false);
            await loadPins(loadedMaps);
        };

        loadMaps();

        const handleMapsUpdated = () => {
            loadMaps();
        };

        window.addEventListener('mapsUpdated', handleMapsUpdated);

        return () => {
            window.removeEventListener('mapsUpdated', handleMapsUpdated);
        };
        }, [loadPins]);

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
    const canEditPin = (pin) => canEditPinInMaps(pin, maps);
    const canModifySelection = (id) => maps.some(map => canEditMap(map) && (
        id === getMapSelectionId(map.id) ||
        map.submaps.some(submap => id === getSubmapSelectionId(submap.id))
    ));
    
    const togglePinMap = (id) => {
        setSelectedMaps(prev => {
            const selected = new Set(prev);

            const clickedMap = maps.find(map => map.id === id);

            if (!canEditMap(clickedMap)) {
                return [...selected];
            }

            // All Places selects or deselects everything
            if (clickedMap.isDefault) {
                const allIds = maps.filter(canEditMap).flatMap(map => [
                    getMapSelectionId(map.id),
                    ...map.submaps.map(submap =>
                        getSubmapSelectionId(submap.id)
                    )
                ]);

                const everythingSelected = allIds.every(
                    selectionId => selected.has(selectionId)
                );

                const updated = new Set(selected);
                allIds.forEach(id => everythingSelected ? updated.delete(id) : updated.add(id));
                return [...updated];
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
                .filter(map => !map.isDefault && canEditMap(map))
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
        if (!canEditMap(maps.find(map => map.id === mapId))) return;
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
                .filter(map => !map.isDefault && canEditMap(map))
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

    const handleLeaveMap = async (mapId) => {
        const map = maps.find(map => map.id === mapId);

        if (!map || !['editor', 'viewer'].includes(map.role) || leavingMapRef.current) {
            return false;
        }

        leavingMapRef.current = true;
        setLeavingMapId(mapId);

        try {
            const { data: userData, error: userError } = await supabase.auth.getUser();

            if (userError || !userData.user) {
                throw userError || new Error('You must be logged in to leave a map.');
            }

            // Confirm ownership from the database before removing membership.
            const { data: currentMap, error: mapError } = await supabase
                .from('maps')
                .select('user_id')
                .eq('id', mapId)
                .single();

            if (mapError) throw mapError;
            if (currentMap.user_id === userData.user.id) {
                throw new Error('Owners cannot leave their own maps.');
            }

            const { data: removedMemberships, error } = await supabase
                .from('map_collaborators')
                .delete()
                .eq('map_id', mapId)
                .eq('user_id', userData.user.id)
                .select('map_id, user_id');

            if (error) throw error;
            if (!removedMemberships || removedMemberships.length !== 1) {
                throw new Error('Could not confirm that you left the map. Your membership may already be removed, or database permissions may block leaving. Please reload and try again.');
            }

            const removedSelectionIds = new Set([
                getMapSelectionId(mapId),
                ...map.submaps.map(submap => getSubmapSelectionId(submap.id))
            ]);

            setMaps(prevMaps => prevMaps.filter(item => item.id !== mapId));
            ++pinLoadRef.current;
            const remainingSelectionIds = new Set(maps.filter(item => item.id !== mapId).flatMap(item => [
                getMapSelectionId(item.id),
                ...item.submaps.map(submap => getSubmapSelectionId(submap.id))
            ]));
            setPins(prev => prev.filter(pin => pin.userId === userData.user.id ||
                pin.maps.some(id => remainingSelectionIds.has(id))
            ));
            setSelectedMaps(prev => prev.filter(id => !removedSelectionIds.has(id)));
            setExpandedPinMaps(prev => prev.filter(id => id !== mapId));

            // Close pin dialogs holding selections from the map we just left.
            if ([selectedPin, editingPin, deletingPin].some(pin =>
                pin?.maps.some(id => removedSelectionIds.has(id))
            )) {
                setSelectedPin(null);
                setEditingPin(null);
                setDeletingPin(null);
                setNewPin(null);
                setPinName('');
                setPinNotes('');
                setSelectedMaps([]);
            }

            await loadPins(maps.filter(item => item.id !== mapId));
            return true;
        } catch (error) {
            console.error('Error leaving map:', error);
            alert(error.message || 'Could not leave the map. Please try again.');
            return false;
        } finally {
            leavingMapRef.current = false;
            setLeavingMapId(null);
        }
    };

    const openDeletePin = async (pin) => {
        const requestId = ++deleteCheckRef.current;
        setDeletingPin(pin);
        setSelectedPin(null);
        setCanDeleteEverywhere(null);
        setDeletePermissionError('');

        try {
            // The server must check every connection, including hidden destinations.
            const { data, error } = await supabase.rpc('can_delete_pin_everywhere', {
                p_pin_id: pin.id
            });

            if (requestId !== deleteCheckRef.current) return;
            if (error || typeof data !== 'boolean') {
                throw error || new Error('Invalid deletion permission response');
            }
            setCanDeleteEverywhere(data);
        } catch (error) {
            if (requestId !== deleteCheckRef.current) return;
            console.error('Error checking pin deletion permission:', error);
            setCanDeleteEverywhere(false);
            setDeletePermissionError('Could not verify deletion permission. Please try again after database support is available.');
        }
    };

    const handleDeletePinEverywhere = async () => {
        if (!deletingPin || canDeleteEverywhere !== true || pinActionRef.current) return;
        pinActionRef.current = true;
        setPinActionPending(true);
        try {
            // This RPC must recheck all destinations atomically before deleting.
            const { data, error } = await supabase.rpc('delete_pin_everywhere', {
                p_pin_id: deletingPin.id
            });
            if (error || data !== true) {
                console.error('Error deleting pin everywhere:', error);
                setCanDeleteEverywhere(false);
                setDeletePermissionError('Could not delete this pin everywhere. All destinations must still allow you to edit.');
                return;
            }

            setPins(prev => prev.filter(pin => pin.id !== deletingPin.id));
            setDeletingPin(null);
            await loadPins(maps);
        } catch (error) {
            console.error('Error deleting pin everywhere:', error);
            setCanDeleteEverywhere(false);
            setDeletePermissionError('Could not delete the pin. Please try again.');
        } finally {
            pinActionRef.current = false;
            setPinActionPending(false);
        }
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
                    onLeaveMap={handleLeaveMap}
                    leavingMapId={leavingMapId}
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

                                    {(canEditPin(selectedPin) || selectedPin.maps.length === 0 && selectedPin.userId === currentUserId) && (
                                    <div className="pin-popup-buttons">
                                        {canEditPin(selectedPin) && (
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
                                        )}

                                        <button
                                            className="pin-delete-button"
                                            onClick={() => openDeletePin(selectedPin)}
                                        >
                                            Delete Pin Everywhere
                                        </button>
                                    </div>
                                    )}
                                </div>
                            </Popup>
                        )}
                    </Map>

                    {(newPin || editingPin) && (
                        <div className="pin-details-overlay">
                            <div className="pin-details-popup">
                                <h3>{editingPin ? 'Edit Pin' : 'Add Pin'}</h3>
                                {editingPin && (
                                    <p>Changes to this pin's details apply everywhere it appears.</p>
                                )}

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
                                    {maps.filter(canEditMap).map((map) => (
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
                                                    disabled={!canEditMap(map)}
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
                                                                disabled={!canEditMap(map)}
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

                                            const { data: userData, error: userError } = await supabase.auth.getUser();
                                            if (userError || !userData.user) {
                                                alert('You must be logged in to save a pin.');
                                                return;
                                            }
                                            if (editingPin && !canEditPin(editingPin)) {
                                                alert('You must be an owner or editor of a connected map to edit this pin.');
                                                return;
                                            }
                                            const defaultSelectionId = getMapSelectionId(maps.find(map => map.isDefault)?.id);
                                            const newSelections = selectedMaps.filter(id => id !== defaultSelectionId &&
                                                !editingPin?.maps.includes(id)
                                            );
                                            if (newSelections.some(id => !canModifySelection(id))) {
                                                alert('You can only add pins to maps where you are an owner or editor.');
                                                return;
                                            }

                                            let hasDestination = selectedMaps.some(id => id !== defaultSelectionId) ||
                                                editingPin?.maps.some(id => !canModifySelection(id));

                                            if (!hasDestination && editingPin) {
                                                try {
                                                    // A linked, editable pin may also have hidden read-only
                                                    // connections. The existing RPC checks those without
                                                    // revealing their destinations; they will be preserved.
                                                    const { data, error } = await supabase.rpc('can_delete_pin_everywhere', {
                                                        p_pin_id: editingPin.id
                                                    });
                                                    if (error || typeof data !== 'boolean') {
                                                        throw error || new Error('Invalid pin permission response');
                                                    }
                                                    hasDestination = data === false;
                                                } catch (error) {
                                                    console.error('Error checking preserved pin connections:', error);
                                                    alert('Could not verify remaining connections. Please try again.');
                                                    return;
                                                }
                                            }

                                            if (!hasDestination) {
                                                alert('Please select at least one map.');
                                                return;
                                            }

                                            if (editingPin) {
                                                const { data: updatedPin, error: pinError } = await supabase
                                                    .from('pins')
                                                    .update({
                                                        name: pinName.trim(),
                                                        notes: pinNotes.trim()
                                                    })
                                                    .eq('id', editingPin.id)
                                                    .select('id')
                                                    .single();

                                                if (pinError || !updatedPin) {
                                                    console.error(
                                                        'Error updating pin:',
                                                        JSON.stringify(pinError, null, 2)
                                                    );
                                                    alert('Could not update the pin.');
                                                    return;
                                                }

                                                // Leave unchanged and read-only connections intact.
                                                const removedSelections = editingPin.maps.filter(id =>
                                                    !selectedMaps.includes(id) && canModifySelection(id)
                                                );
                                                for (const id of removedSelections) {
                                                    const isMap = id.startsWith('map:');
                                                    const { data: removedRows, error: deleteMapError } = await supabase
                                                        .from('pin_maps')
                                                        .delete()
                                                        .eq('pin_id', editingPin.id)
                                                        .eq(isMap ? 'map_id' : 'submap_id', Number(id.split(':')[1]))
                                                        .select('id');

                                                    if (deleteMapError || !removedRows?.length) {
                                                        console.error('Error removing pin connection:', deleteMapError);
                                                        alert('Could not remove a pin connection. Your map permissions may have changed.');
                                                        await loadPins(maps);
                                                        setEditingPin(null);
                                                        return;
                                                    }
                                                }

                                                const pinMapRows = newSelections
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
                                                        await loadPins(maps);
                                                        setEditingPin(null);
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
                                                                maps: [...new Set([
                                                                    ...selectedMaps,
                                                                    ...editingPin.maps.filter(id => !canModifySelection(id))
                                                                ])]
                                                            }
                                                            : pin
                                                    )
                                                );
                                                await loadPins(maps);
                                            } else {
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
                                                    userId: newPinData.user_id,
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
                                <h3>Delete Pin Everywhere?</h3>

                                <p>
                                    Delete "{deletingPin.name}" everywhere? This deletes the pin and all its map and submap connections.
                                </p>
                                {canDeleteEverywhere === null && <p>Checking deletion permission...</p>}
                                {deletePermissionError && <p>{deletePermissionError}</p>}
                                {canDeleteEverywhere === false && !deletePermissionError && (
                                    <p className="pin-delete-permission-message">This pin also belongs to a map you can't edit, so it can't be deleted everywhere.</p>
                                )}

                                <div className="pin-details-buttons">
                                    <button
                                        disabled={pinActionPending}
                                        onClick={() => {
                                            ++deleteCheckRef.current;
                                            setDeletingPin(null);
                                        }}
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        className="pin-delete-button"
                                        disabled={pinActionPending || canDeleteEverywhere !== true}
                                        onClick={handleDeletePinEverywhere}
                                    >
                                        {pinActionPending ? 'Deleting...' : 'Delete Pin Everywhere'}
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
