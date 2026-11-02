import Dialog from '../components/Dialog';
import PinPopupContent from '../components/PinPopupContent';
import DeletePinDialog from '../components/DeletePinDialog';
import { canRemovePinConnections, createPinDeletion, deletionFeedback, readDeletionMaps } from '../pinDeletion';
import PinFormFields from '../components/PinFormFields';
import { dialogStack } from '../dialogs';
import { useDialogAction } from '../useDialogAction';
import { isRejectedPinWrite, confirmedPinRollback, createPinRecovery } from '../pinSaveSafety';
import Map, { AttributionControl, Marker, Popup } from '@vis.gl/react-maplibre';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(workerUrl);
import './Map.css';
import Navbar from '../components/Navbar';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import MapSidebar from '../components/MapSidebar';
import { supabase } from '../supabaseClient';
import { MAP_STYLES } from '../mapStyles';
import { applyPersonalOrder, pinColor } from '../mapOrdering';
import { useMapOrdering } from '../useMapOrdering';
import PlaceSearch from '../components/PlaceSearch';
import { pinDraftFromPlace, searchContext } from '../placeSearch';

const getMapSelectionId = (id) => `map:${id}`;
const getSubmapSelectionId = (id) => `submap:${id}`;
const canEditMap = (map) => map?.role === 'owner' || map?.role === 'editor';
const canEditPinInMaps = canRemovePinConnections;

function PinSphereMap({ mapStyle }) {

    
    const [pinNeedsReload, setPinNeedsReload] = useState(false);
    const [pinRecovery] = useState(createPinRecovery);
    const [recoveringPin, setRecoveringPin] = useState(false);
    const [recoveryMessage, setRecoveryMessage] = useState('');
    const [unconfirmedCreation, setUnconfirmedCreation] = useState(false);
    const pinWriteStarted = useRef(false);
    const pinAction = useDialogAction({ onError: () => {
        if (pinWriteStarted.current) {
            lockPinSave();

            return editingPin ? 'The save could not be confirmed. Some changes may already be saved. Your draft is kept; use Check saved pin before retrying.' : 'Pin creation could not be confirmed. Your draft is kept; refresh and check All Places before adding it again.';
        }
    } });
    const [pinErrors, setPinErrors] = useState({});
    useEffect(() => {
        if (pinAction.busy) return;
        if (pinErrors.name) document.getElementById('pin-name')?.focus();
        else if (pinErrors.maps) document.querySelector('.pin-map-list')?.focus();
    }, [pinErrors, pinAction.busy]);
    //keeps track of whether the sidebar is open or closed. 
    const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 700px)').matches);

    const [addingPin, setAddingPin] = useState(false);
    const [newPin, setNewPin] = useState(null);
    const mapRef = useRef(null);
    const [searchPreview, setSearchPreview] = useState(null);
    const [pinName, setPinName] = useState('');
    const [selectedMaps, setSelectedMaps] = useState([]);
    const [expandedPinMaps, setExpandedPinMaps] = useState([]);
    const [pins, setPins] = useState([]);
    const [selectedPin, setSelectedPin] = useState(null);
    const pinTriggerRef = useRef(null);
    const pinFormReturnRef = useRef(null);
    const closePinPopup = () => {
        setSelectedPin(null);
        pinTriggerRef.current?.focus({ preventScroll: true });
    };
    useEffect(() => {
        if (!selectedPin) return;
        const onEscape = event => {
            if (event.key !== 'Escape' || dialogStack.active) return;
            event.preventDefault();
            event.stopPropagation();
            setSelectedPin(null);
            pinTriggerRef.current?.focus({ preventScroll: true });
        };
        document.addEventListener('keydown', onEscape, true);
        return () => document.removeEventListener('keydown', onEscape, true);
    }, [selectedPin]);
    const [editingPin, setEditingPin] = useState(null);
    const [pinNotes, setPinNotes] = useState('');
    const [deletingPin, setDeletingPin] = useState(null);
    const [deletePermissionError, setDeletePermissionError] = useState('');
    const [pinActionPending, setPinActionPending] = useState(false);
    const pinActionRef = useRef(false);
    const [pinDeletion] = useState(() => createPinDeletion(supabase));
    const [deleteNeedsRefresh, setDeleteNeedsRefresh] = useState(false);
    const [deleteStatus, setDeleteStatus] = useState('');
    const [checkingUser, setCheckingUser] = useState(true);
    const [leavingMapId, setLeavingMapId] = useState(null);
    const leavingMapRef = useRef(false);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [rawMaps, setMaps] = useState([]);
    const ordering = useMapOrdering(currentUserId, rawMaps);
    const maps = useMemo(() => applyPersonalOrder(rawMaps, ordering.order), [rawMaps, ordering.order]);
    const [loadingMaps, setLoadingMaps] = useState(true);
    const pinLoadRef = useRef(0);

    const currentPinDraft = () => ({ name: pinName, notes: pinNotes, maps: [...selectedMaps], location: newPin });
    const lockPinSave = () => {
        setPinNeedsReload(true);
        if (editingPin) pinRecovery.lock(editingPin, currentPinDraft());
        else {
            pinRecovery.lockCreation(currentPinDraft());
            setUnconfirmedCreation(true);
        }
    };
    const closePinForm = () => {
        if (editingPin) pinRecovery.keepDraft(editingPin.id, currentPinDraft());
        else if (unconfirmedCreation) pinRecovery.lockCreation(currentPinDraft());
        setNewPin(null);
        setEditingPin(null);
    };
    const recoverPin = async () => {
        if (!editingPin || recoveringPin || pinAction.busy) return;
        pinRecovery.keepDraft(editingPin.id, currentPinDraft());
        setRecoveringPin(true);
        pinAction.clear();
        try {
            const { pin, draft } = await pinRecovery.recover(supabase, editingPin.id);
            if (!canEditPin(pin)) {
                pinRecovery.lock(pin, draft);
                throw new Error('This pin is no longer editable with your current map access. Your draft is kept.');
            }
            setPins(items => items.map(item => item.id === pin.id ? pin : item));
            setEditingPin(pin);
            setPinName(draft.name);
            setPinNotes(draft.notes);
            setSelectedMaps(draft.maps);
            setPinNeedsReload(false);
            setRecoveryMessage('Saved pin and connections verified. Your draft is kept; review it before saving.');
        } catch (error) {
            setRecoveryMessage(error.message || 'Could not verify the saved pin. Your draft is kept; reconnect and try again.');
        } finally { setRecoveringPin(false); }
    };

    const openPinForm = (draft) => {
        const held = pinRecovery.getCreation();
        if (held) draft = { ...held.location, name: held.name };
        setPinErrors({});
        setRecoveryMessage('');
        setPinNeedsReload(Boolean(held) || unconfirmedCreation);
        setAddingPin(false);
        setSearchPreview(null);
        setSelectedPin(null);
        setEditingPin(null);
        setNewPin({ longitude: draft.longitude, latitude: draft.latitude });
        setPinName(draft.name || '');
        setPinNotes(held?.notes || '');
        setSelectedMaps(held?.maps || []);
        setExpandedPinMaps([]);
    };

    const startManualPlacement = () => {
        if (window.matchMedia('(max-width: 700px)').matches) setSidebarOpen(false);
        setSearchPreview(null);
        setSelectedPin(null);
        setAddingPin(true);
    };

    useEffect(() => {
        if (!addingPin) return;
        const cancel = event => {
            if (event.key === 'Escape' && !event.isComposing && !dialogStack.active) setAddingPin(false);
        };
        document.addEventListener('keydown', cancel, true);
        return () => document.removeEventListener('keydown', cancel, true);
    }, [addingPin]);

    const previewPlace = (place) => {
        const narrowScreen = window.innerWidth <= 700;
        if (narrowScreen) setSidebarOpen(false);
        setAddingPin(false);
        setSelectedPin(null);
        setSearchPreview(place);
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800;
        if (place.bounds) {
            const [west, south, east, north] = place.bounds;
            mapRef.current?.fitBounds([[west, south], [east, north]], {
                padding: { top: 130, bottom: 100, left: sidebarOpen && window.innerWidth > 700 ? 270 : 60, right: 40 },
                maxZoom: place.isArea ? 13 : 17, duration, retainPadding: false,
            });
        } else {
            mapRef.current?.flyTo({ center: [place.longitude, place.latitude], zoom: place.isArea ? 10 : 16,
                offset: [sidebarOpen && !narrowScreen ? 125 : 0, 40], duration, retainPadding: false });
        }
    };

    const loadPins = useCallback(async (accessMaps, { preserveDraft = false, preserveDeletion = false } = {}) => {
        const requestId = ++pinLoadRef.current;
        const { data: userData, error: userError } =
            await supabase.auth.getUser();

        if (userError || !userData.user) {
            console.error('Error getting user:', userError);
            return false;
        }

        const userId = userData.user.id;
        if (requestId !== pinLoadRef.current) return false;
        setCurrentUserId(userId);

        // RLS returns personal pins and pins on accessible shared maps.
        const { data: pinData, error: pinError } = await supabase
            .from('pins')
            .select('*');

        if (requestId !== pinLoadRef.current) return false;

        if (pinError || !Array.isArray(pinData)) {
            console.error('Error loading pins:', JSON.stringify(pinError, null, 2));
            return false;
        }

        if (pinData.length === 0) {
            setPins([]);
            setSelectedPin(null);
            if (!preserveDraft) setEditingPin(null);
            if (!preserveDeletion) setDeletingPin(null);
            return true;
        }

        // Get the map/submap connections for these pins
        const { data: pinMapData, error: pinMapError } = await supabase
            .from('pin_maps')
            .select('*')
            .in(
                'pin_id',
                pinData.map(pin => pin.id)
            );

        if (pinMapError || !Array.isArray(pinMapData)) {
            console.error('Error loading pin map connections:', pinMapError);
            return false;
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

        if (requestId !== pinLoadRef.current) return false;
        setPins(loadedPins);
        setSelectedPin(prev => prev ? loadedPins.find(pin => pin.id === prev.id) || null : null);
        if (!preserveDraft) setEditingPin(prev => prev && loadedPins.some(pin => pin.id === prev.id && canEditPinInMaps(pin, accessMaps)) ? prev : null);
        if (!preserveDeletion) setDeletingPin(prev => prev && loadedPins.some(pin => pin.id === prev.id && (
            canEditPinInMaps(pin, accessMaps)
        )) ? prev : null);
        return true;
    }, [setCurrentUserId, setPins, setSelectedPin, setEditingPin, setDeletingPin]);

    useEffect(() => {
        const loadMaps = async () => {
            const { data: userData } = await supabase.auth.getUser();

            if (!userData.user) {
                // App handles redirects from Supabase session changes.
                return;
            }

            const userId = userData.user.id;
            setCurrentUserId(userId);

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

            const loadedMaps = finalMapData.map(map => {
                    const collaborator = (collaboratorData || []).find(
                        item => item.map_id === map.id
                    );

                    return {
                        id: map.id,
                        name: map.name,
                        visible: false,
                        isDefault: map.is_default === true && map.user_id === userId && map.name === 'All Places',
                        color: map.color,
                        sortOrder: map.sort_order,
                        role: map.user_id === userId
                            ? 'owner'
                            : collaborator?.role || 'viewer',
                        submaps: (submapData || [])
                            .filter(submap => submap.map_id === map.id)
                            .map(submap => ({
                                id: submap.id,
                                name: submap.name,
                                visible: false,
                                color: submap.color,
                                sortOrder: submap.sort_order
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
    "isDefault" identifies only the signed-in user's own All Places control.
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

    const getPinColor = (pin) => pinColor(pin, maps);

    const isPinVisible = (pin) => {
        const allPlacesVisible = maps.find(map => map.isDefault)?.visible;

        return pin.maps.some(selectionId => {
            if (selectionId.startsWith('map:')) {
                const mapId = Number(selectionId.replace('map:', ''));
                const map = maps.find(map => map.id === mapId);

                return map ? allPlacesVisible || map.visible : false;
            }

            if (selectionId.startsWith('submap:')) {
                const submapId = Number(selectionId.replace('submap:', ''));

                return maps.some(map =>
                    map.submaps.some(
                        submap =>
                            submap.id === submapId && (allPlacesVisible || submap.visible)
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
            throw error;
        } finally {
            leavingMapRef.current = false;
            setLeavingMapId(null);
        }
    };

    const openDeletePin = (pin) => {
        if (!canEditPin(pin)) return;
        setDeletingPin(pin);
        setSelectedPin(null);
        const locked = pinDeletion.needsRefresh(pin.id);
        setDeleteNeedsRefresh(locked);
        setDeletePermissionError(locked ? 'Refresh the map to verify the previous removal before trying again.' : '');
        setDeleteStatus('');
    };

    const handleDeletePin = async (refreshOnly = false) => {
        if (!deletingPin || pinActionRef.current) return;
        pinActionRef.current = true;
        setPinActionPending(true);
        try {
            const refresh = async () => {
                const freshMaps = await readDeletionMaps(supabase, currentUserId, maps);
                setMaps(freshMaps);
                return loadPins(freshMaps, { preserveDraft: true, preserveDeletion: true });
            };
            const result = refreshOnly
                ? await pinDeletion.refresh(deletingPin.id, refresh)
                : await pinDeletion.remove(deletingPin.id, pins.some(pin => pin.id === deletingPin.id && canEditPin(pin)), refresh);
            if (!result) return;
            const message = deletionFeedback(result);
            setDeleteNeedsRefresh(pinDeletion.needsRefresh(deletingPin.id));
            if (result.outcome === 'saved' && result.refreshed) {
                setDeletingPin(null);
                setDeleteStatus(message);
            } else setDeletePermissionError(message);
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

            <div className={`map-page${sidebarOpen ? ' sidebar-is-open' : ''}`}>

                {/* Sidebar component that allows users to toggle visibility of maps and rename them. */}
                <MapSidebar 
                    isOpen={sidebarOpen} 
                    setIsOpen={setSidebarOpen} 
                    maps={maps}
                    currentUserId={currentUserId}
                    setMaps={setMaps}
                    onLeaveMap={handleLeaveMap}
                    leavingMapId={leavingMapId}
                    onReorder={ordering.reorder}
                    orderStatus={ordering.status}
                    onRetryOrder={ordering.retry}
                />

                <div className="map-wrapper">
                    <div className="map-workspace-controls">
                        <PlaceSearch
                            getContext={() => searchContext(mapRef.current)}
                            onSelect={previewPlace}
                            onManual={startManualPlacement} />
                        <button type="button" className="add-pin-button" aria-pressed={addingPin}
                            onClick={() => addingPin ? setAddingPin(false) : startManualPlacement()}>
                            {addingPin ? 'Cancel placement' : '+ Place Pin Manually'}
                        </button>
                    </div>
                    {deleteStatus && <p className="workspace-sr-only" role="status">{deleteStatus}</p>}
                    <span className="workspace-sr-only" role="status">
                        {addingPin ? 'Placement active. Click the map to place a pin. Press Escape to cancel.' : 'Manual placement inactive.'}
                    </span>
                    {/* Main map component that displays the map using MapLibre GL. */}
                    <Map ref={mapRef} className="map-container"
                        attributionControl={false}
                        initialViewState={{
                            longitude: -30,
                            latitude: 30,
                            zoom: 2,
                        }}
                        style={{
                            width: '100%',
                            height: '100%'
                        }}
                        mapStyle={MAP_STYLES.find(style => style.id === mapStyle)?.url || MAP_STYLES[0].url}
                        onClick={(event) => {
                            if (!addingPin) return;
                            openPinForm({
                                longitude: event.lngLat.lng,
                                latitude: event.lngLat.lat
                            });
                        }}
                    >
                        <AttributionControl position="bottom-right" customAttribution={[
                            '<a href="https://maplibre.org/" target="_blank">MapLibre</a>',
                            'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a>',
                        ]} />
                        {searchPreview && <>
                            <Marker longitude={searchPreview.longitude} latitude={searchPreview.latitude} />
                            <Popup longitude={searchPreview.longitude} latitude={searchPreview.latitude}
                                anchor="bottom" maxWidth="300px" onClose={() => setSearchPreview(null)} closeOnClick={false}>
                                <div className="search-preview">
                                    <strong>{searchPreview.name}</strong>
                                    <p>{searchPreview.address}</p>
                                    {searchPreview.isArea && <p>This is an area, not an exact venue. The marker shows a representative point.</p>}
                                    <button onClick={() => openPinForm(pinDraftFromPlace(searchPreview))}>
                                        {searchPreview.isArea ? 'Add Pin at this point' : 'Add Pin'}
                                    </button>
                                    {searchPreview.isArea && <button onClick={startManualPlacement}>Choose an exact point</button>}
                                </div>
                            </Popup>
                        </>}
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
                                    title={pin.name} role="button" tabIndex={0} aria-label={`View ${pin.name}`}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); event.currentTarget.click(); }
                                        if (event.key === 'Escape') closePinPopup();
                                    }}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setSearchPreview(null);
                                        pinTriggerRef.current = event.currentTarget;
                                        setSelectedPin(pin);
                                    }}
                                />
                            </Marker>
                        ))}

                        {selectedPin && (
                            <Popup
                                longitude={selectedPin.longitude}
                                latitude={selectedPin.latitude}
                                onClose={closePinPopup}
                                maxWidth="min(340px, calc(100vw - 32px))"
                                closeButton={true}
                                anchor="bottom"
                            >
                                <PinPopupContent pin={selectedPin} maps={maps} editable={canEditPin(selectedPin)}
                                    onClose={closePinPopup} onDelete={() => { pinFormReturnRef.current = pinTriggerRef.current; openDeletePin(selectedPin); }} onEdit={() => {
                                        pinFormReturnRef.current = pinTriggerRef.current;
                                        const held = pinRecovery.get(selectedPin.id);
                                        setEditingPin(selectedPin);
                                        setPinNeedsReload(Boolean(held));
                                        setRecoveryMessage(held ? 'This pin has an uncertain save. Your draft is kept. Check the saved pin and connections before saving again.' : '');
                                        setPinErrors({});
                                        setPinName(held?.draft.name ?? selectedPin.name);
                                        setSelectedMaps(held?.draft.maps ?? selectedPin.maps);
                                        setSelectedPin(null);
                                        setPinNotes(held?.draft.notes ?? selectedPin.notes ?? '');
                                    }} />
                            </Popup>
                        )}
                    </Map>

                    {(newPin || editingPin) && (
                        <Dialog returnFocusRef={editingPin ? pinFormReturnRef : undefined} label={editingPin ? 'Edit Pin' : 'Add Pin'} onClose={closePinForm} busy={pinAction.busy || recoveringPin} busyLabel={recoveringPin ? 'Checking saved pin…' : 'Saving…'} error={pinAction.error} onOpen={pinAction.clear}>
                            <div className="pin-details-popup">
                                <h3>{editingPin ? 'Edit Pin' : 'Add Pin'}</h3>
                                <PinFormFields editing={Boolean(editingPin)} unconfirmed={unconfirmedCreation} errors={pinErrors}
                                    name={pinName} notes={pinNotes} onName={setPinName} onNotes={setPinNotes}
                                    maps={maps} selected={selectedMaps} expanded={expandedPinMaps}
                                    onExpand={togglePinMapExpand} onMap={togglePinMap} onSubmap={togglePinSubmap} />

                                {editingPin && (pinNeedsReload || recoveryMessage) && <div className="pin-recovery">
                                    <p role="status">{recoveryMessage || 'Some changes may already be saved. Your draft is kept; check the saved pin before retrying.'}</p>
                                    {pinNeedsReload && <button type="button" onClick={recoverPin}>Check saved pin</button>}
                                </div>}
                                <div className="pin-details-buttons">
                                    <button
                                        onClick={closePinForm}
                                    >
                                        Cancel
                                    </button>

                                    <button className="pin-edit-button" disabled={pinNeedsReload}
                                        onClick={event => pinAction.run(async () => {
                                            if (pinNeedsReload || (editingPin ? pinRecovery.get(editingPin.id) : pinRecovery.getCreation())) return;
                                            pinWriteStarted.current = false;
                                            setPinErrors({});
                                            if (pinName.trim() === '') {
                                                setPinErrors({ name: 'Please enter a name for the pin.' });
                                                return;
                                            }

                                            const { data: userData, error: userError } = await supabase.auth.getUser();
                                            if (userError || !userData.user) {
                                                pinAction.setError('You must be logged in to save a pin.');
                                                return;
                                            }
                                            if (editingPin && !canEditPin(editingPin)) {
                                                pinAction.setError('You must be an owner or editor of a connected map to edit this pin.');
                                                return;
                                            }
                                            const defaultSelectionId = getMapSelectionId(maps.find(map => map.isDefault)?.id);
                                            const newSelections = selectedMaps.filter(id => id !== defaultSelectionId &&
                                                !editingPin?.maps.includes(id)
                                            );
                                            if (newSelections.some(id => !canModifySelection(id))) {
                                                pinAction.setError('You can only add pins to maps where you are an owner or editor.');
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
                                                    pinAction.setError('Could not verify remaining connections. Please try again.');
                                                    return;
                                                }
                                            }

                                            if (!hasDestination) {
                                                setPinErrors({ maps: 'Please select at least one map.' });
                                                return;
                                            }

                                            if (editingPin) {
                                                pinWriteStarted.current = true;
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
                                                    pinAction.setError('Could not update the pin.');
                                                    if (!isRejectedPinWrite(pinError)) {
                                                        lockPinSave();
                                                        pinAction.setError('The save could not be confirmed. Your entries are kept; use Check saved pin before retrying.');
                                                    }
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
                                                        pinAction.setError('Could not remove a pin connection. Your map permissions may have changed.');
                                                        await loadPins(maps, { preserveDraft: true });
                                                        pinAction.setError('Some changes may already be saved. Your entries are kept; use Check saved pin to verify its current connections before retrying.');
                                                        lockPinSave();
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
                                                        pinAction.setError('Could not save the pin maps.');
                                                        await loadPins(maps, { preserveDraft: true });
                                                        pinAction.setError('Some changes may already be saved. Your entries are kept; use Check saved pin to verify its current connections before retrying.');
                                                        lockPinSave();
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
                                                pinWriteStarted.current = true;
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

                                                if (pinError || !newPinData) {
                                                    console.error('Error creating pin:', pinError);
                                                    pinAction.setError('Could not save the pin.');
                                                    if (!isRejectedPinWrite(pinError)) {
                                                        lockPinSave();

                                                        pinAction.setError('The pin creation could not be confirmed. Your entries are kept; refresh and check All Places before adding it again.');
                                                    }
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
                                                    const { data: rolledBack, error: rollbackError } = await supabase
                                                        .from('pins')
                                                        .delete()
                                                        .eq('id', newPinData.id)
                                                        .select('id');

                                                    pinAction.setError('Could not save the pin maps.');
                                                    if (!confirmedPinRollback(newPinData.id, { data: rolledBack, error: rollbackError })) {
                                                        lockPinSave();

                                                        pinAction.setError('The pin may have been created without all connections. Your entries are kept; close and check the map before adding it again.');
                                                    }
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
                                        })(event)}
                                    >
                                        Save Pin
                                    </button>
                                </div>
                            </div>
                        </Dialog>
                    )}

                    {deletingPin && <DeletePinDialog returnFocusRef={pinFormReturnRef}
                        busy={pinActionPending} needsRefresh={deleteNeedsRefresh} message={deletePermissionError}
                        editable={pins.some(pin => pin.id === deletingPin.id && canEditPin(pin))}
                        onClose={() => setDeletingPin(null)} onDelete={() => handleDeletePin()}
                        onRefresh={() => handleDeletePin(true)} />}

                    
                </div>
            </div>
        </>
    );
}

export default PinSphereMap;
