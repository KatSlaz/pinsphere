import './Collaboration.css'
import Dialog from './Dialog';
import ColorPicker from './ColorPicker';
import { useDialogAction } from '../useDialogAction';
import { normalizeHex } from '../colors';
import './MapSidebar.css';
import { useState } from 'react';
import { useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { DragDropProvider } from '@dnd-kit/react';
import OrderableRow from './OrderableRow';
import { moveWithinList } from '../mapOrdering';
import CollaboratorsModal from './CollaboratorsModal';
import SidebarMenu from './SidebarMenu';

function MapSidebar({ isOpen, setIsOpen, maps, setMaps, currentUserId, onLeaveMap, leavingMapId, onReorder, orderStatus, onRetryOrder }) {
    
    const action = useDialogAction();
    const [notice, setNotice] = useState('');
    // Keeps track of which map is currently being customized with null meaning no map is being customized.
    const [customizingMap, setCustomizingMap] = useState(null);

    //keeps track of which map we are renaming
    const [renamingMap, setRenamingMap] = useState(null);

    const [deletingMap, setDeletingMap] = useState(null);
    const [newMapName, setNewMapName] = useState('');
    const [addingSubmap, setAddingSubmap] = useState(null);
    const [newSubmapName, setNewSubmapName] = useState('');
    const [addingMap, setAddingMap] = useState(false);
    const [expandedMaps, setExpandedMaps] = useState([]);
    const [customizingSubmap, setCustomizingSubmap] = useState(null);
    const [renamingSubmap, setRenamingSubmap] = useState(null);
    const [deletingSubmap, setDeletingSubmap] = useState(null);
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [changingColor, setChangingColor] = useState(null);
    const [newColor, setNewColor] = useState('#3388ff');
    const [sharingMap, setSharingMap] = useState(null);
    const [collaboratorEmail, setCollaboratorEmail] = useState('');
    const [collaboratorRole, setCollaboratorRole] = useState('viewer');
    const [leavingMap, setLeavingMap] = useState(null);
    const [viewingCollaborators, setViewingCollaborators] = useState(null);
    const collaboratorsReturnFocus = useRef(null);
    
    const closeMenu = useCallback((restoreFocus = false) => {
        setCustomizingMap(null);
        setCustomizingSubmap(null);
        if (restoreFocus) menuAnchor?.focus();
    }, [menuAnchor]);

    // Toggles the visibility of a map by its ID and all its submaps.
    function toggleMap(id) {
        setMaps(prevMaps => {
            
            const selectedMap = prevMaps.find(map => map.id === id);

            if (selectedMap?.isDefault) {
                const newVisibility = !selectedMap.visible;

                return prevMaps.map(map => ({
                    ...map,
                    visible: newVisibility,
                    submaps: map.submaps.map(submap => ({
                        ...submap,
                        visible: newVisibility
                    }))
                }));
            }

            // Toggle the selected map normally
            const updatedMaps = prevMaps.map(map => {
                if (map.id !== id) {
                    return map;
                }

                if (map.submaps.length > 0) {
                    const newVisibility = !map.visible;

                    return {
                        ...map,
                        visible: newVisibility,
                        submaps: map.submaps.map(submap => ({
                            ...submap,
                            visible: newVisibility
                        }))
                    };
                }

                return {
                    ...map,
                    visible: !map.visible
                };
            });

            // Check if EVERYTHING is now visible
            const everythingVisible = updatedMaps
                .filter(map => !map.isDefault)
                .every(map =>
                    map.visible &&
                    map.submaps.every(submap => submap.visible)
                );

            // Update All Places based on that
            return updatedMaps.map(map =>
                map.isDefault
                    ? { ...map, visible: everythingVisible }
                    : map
            );
        });
    }

    //toggles the visibility of a submap by its ID and updates the parent map visibility.
    function toggleSubmap(mapId, submapId) {
        setMaps(prevMaps => {
            const updatedMaps = prevMaps.map(map => {
                if (map.id !== mapId) {
                    return map;
                }

                const updatedSubmaps = map.submaps.map(submap =>
                    submap.id === submapId
                        ? { ...submap, visible: !submap.visible }
                        : submap
                );

                const allSubmapsVisible = updatedSubmaps.every(
                    submap => submap.visible
                );

                return {
                    ...map,
                    visible: allSubmapsVisible,
                    submaps: updatedSubmaps
                };
            });

            // Check if every map and every submap is visible
            const everythingVisible = updatedMaps
                .filter(map => !map.isDefault)
                .every(map =>
                    map.visible &&
                    map.submaps.every(submap => submap.visible)
                );

            return updatedMaps.map(map =>
                map.isDefault
                    ? { ...map, visible: everythingVisible }
                    : map
            );
        });
    }

    //toggles the expansion of a map by its ID.
    function toggleExpandMap(id) {
        setExpandedMaps(expandedMaps.includes(id) ? expandedMaps.filter(mapId => mapId !== id) : [...expandedMaps, id]);
    }

    return (
        <aside className={`map-sidebar ${isOpen ? 'open' : 'closed'}`}>

            <button className="sidebar-toggle" aria-label={isOpen ? 'Collapse maps sidebar' : 'Open maps sidebar'}
                aria-expanded={isOpen} aria-controls="sidebar-content"
                onClick={() => { closeMenu(); setIsOpen(!isOpen); }}>☰</button>
            
            <div id="sidebar-content" className="sidebar-content" inert={!isOpen}>
                {notice && <p className="order-status" role="status">{notice}</p>}
                <header className="sidebar-header">
                    <h2>My Maps</h2>
                </header>

                {(orderStatus === 'error' || orderStatus === 'load-error') && (
                    <div className="order-status" role="status">
                        {orderStatus === 'error' ? 'Order not saved. Your current order is kept.' : 'Could not load personal order.'}
                        <button onClick={onRetryOrder}>Retry</button>
                    </div>
                )}
                <DragDropProvider onDragEnd={event => {
                    if (event.canceled) return;
                    const source = event.operation.source?.data;
                    const target = event.operation.target?.data;
                    if (!source || !target || source.parentId !== target.parentId) return;
                    const items = source.parentId === null
                        ? maps.filter(map => !map.isDefault)
                        : maps.find(map => map.id === source.parentId)?.submaps || [];
                    const ids = items.map(item => item.id);
                    const next = moveWithinList(ids, source.itemId, target.itemId);
                    if (next !== ids) onReorder(source.parentId, next);
                }}>
                <div className="map-list">
                    
                    {/* Creates a row for each map in the maps array */}
                    {maps.map((map, mapIndex) => {
                        const isOwner = map.role === 'owner';
                        const canEdit = map.role === 'owner' || map.role === 'editor';
                        const canLeave = map.role === 'editor' || map.role === 'viewer';

                        return (
                        
                        <div key={map.id} className="map-item-container">
                            
                            <OrderableRow id={map.id} index={mapIndex} name={map.name} fixed={map.isDefault} className="map-item" onClick={() => toggleMap(map.id)}>
                                    <div className="dropdown-container">
                                        <button 
                                            className={`dropdown-button ${
                                                map.submaps.length === 0 ? 'dropdown-button-hidden' : ''
                                            }`}
                                            aria-label={`${expandedMaps.includes(map.id) ? 'Collapse' : 'Expand'} ${map.name}`}
                                            aria-expanded={expandedMaps.includes(map.id)}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                toggleExpandMap(map.id);
                                            }}
                                        >
                                            <span className="dropdown-arrow" aria-hidden="true" />
                                        </button>
                                    </div>

                                    <div className="checkbox-container">
                                        <input
                                            type="checkbox"
                                            aria-label={`Show ${map.name}`}
                                            style={{ accentColor: map.color }}
                                            checked={map.visible}

                                            //updates the map visibility when checkbox is clicked.
                                            onChange={() => toggleMap(map.id)}

                                            // stops clicking the checkbox from also trigerring the parent div onClick.
                                            onClick={(event) => event.stopPropagation()}
                                        />
                                    </div>

                                    <span className="map-name" title={map.name}>{map.name}</span>

                                {(!map.isDefault && canEdit || canLeave) && (
                                    <button 
                                    className="map-menu-button"
                                    type="button" aria-label={`Actions for ${map.name}`} aria-haspopup="menu"
                                    aria-expanded={customizingMap === map.id} aria-controls={customizingMap === map.id ? 'sidebar-actions-menu' : undefined}
                                    onClick={(event) => {
                                        //prevent the button click from also triggering the parent div onClick.
                                        event.stopPropagation();
                                        setMenuAnchor(event.currentTarget);
                                        setCustomizingSubmap(null);
                                        //toggles customization menu for the map.
                                        setCustomizingMap(customizingMap === map.id ? null : map.id);
                                    }}
                                    >⋮</button>
                                )}
                            </OrderableRow>

                            {/* displays the submaps of a map if it is expanded. */}
                            {expandedMaps.includes(map.id) && (
                                <div className="submap-list">
                                    {map.submaps.map((submap, submapIndex) => (
                                        <OrderableRow
                                            key={submap.id} 
                                            id={submap.id}
                                            index={submapIndex}
                                            parentId={map.id}
                                            name={submap.name}
                                            className="submap-item"
                                            onClick={() => toggleSubmap(map.id, submap.id)}>
                                            <input
                                                type="checkbox"
                                                aria-label={`Show ${submap.name}`}
                                                style={{ accentColor: submap.color }}
                                                checked={submap.visible}
                                                onChange={() => toggleSubmap(map.id, submap.id)}
                                                onClick={(event) => event.stopPropagation()}
                                            />
                                            <span className="submap-name" title={submap.name}>
                                                {submap.name}
                                            </span>
                                            {canEdit && (
                                                <button
                                                    className="submap-menu-button"
                                                    type="button" aria-label={`Actions for ${submap.name}`} aria-haspopup="menu"
                                                    aria-expanded={customizingSubmap === submap.id} aria-controls={customizingSubmap === submap.id ? 'sidebar-actions-menu' : undefined}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setMenuAnchor(event.currentTarget);
                                                        setCustomizingMap(null);
                                                        setCustomizingSubmap(
                                                            customizingSubmap === submap.id ? null : submap.id
                                                        )
                                                    }}
                                                >
                                                    ⋮
                                                </button>
                                            )}

                                            {customizingSubmap === submap.id && (
                                                <SidebarMenu anchor={menuAnchor} id="sidebar-actions-menu" label={`Actions for ${submap.name}`} onClose={closeMenu}>
                                                    <button role="menuitem" tabIndex={-1}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setNewSubmapName(submap.name);
                                                            setRenamingSubmap({
                                                                mapId: map.id,
                                                                submapId: submap.id
                                                            })
                                                            setCustomizingSubmap(null);
                                                        }}
                                                    >
                                                        Rename
                                                    </button>

                                                    <button role="menuitem" tabIndex={-1}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setNewColor(submap.color);
                                                            setChangingColor({
                                                                mapId: map.id,
                                                                submapId: submap.id
                                                            });
                                                            setCustomizingSubmap(null);
                                                        }}
                                                    >
                                                        Change color
                                                    </button>

                                                    <button role="menuitem" tabIndex={-1} className="sidebar-menu-danger"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            
                                                            setDeletingSubmap({
                                                                mapId: map.id,
                                                                submapId: submap.id
                                                            })
                                                            setCustomizingSubmap(null);
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                </SidebarMenu>
                                        )}
                                        
                                        {renamingSubmap &&
                                renamingSubmap.mapId === map.id &&
                                renamingSubmap.submapId === submap.id && (
                                    <Dialog label="Rename Submap" onClose={() => setRenamingSubmap(null)} busy={action.busy} error={action.error} onOpen={action.clear}>
                                        <div 
                                        className="rename-popup"
                                        onClick={(event) => event.stopPropagation()}
                                        >
                                            <h3>Rename Submap</h3>

                                            <input 
                                                type="text"
                                                placeholder="Enter new submap name"
                                                value={newSubmapName}
                                                onChange={(event) => setNewSubmapName(event.target.value)}
                                            />

                                            <div className="rename-buttons">
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setRenamingSubmap(null);
                                                    }}
                                                >
                                                    Cancel
                                                </button>

                                                <button
                                                    onClick={event => action.run(async (event) => {
                                                        event.stopPropagation();

                                                        if (newSubmapName.trim() === '') { action.setError('Please enter a name.'); return; }

                                                        const updatedName = newSubmapName.trim();

                                                        const { error } = await supabase
                                                            .from('submaps')
                                                            .update({ name: updatedName })
                                                            .eq('id', renamingSubmap.submapId);

                                                        if (error) {
                                                            console.error('Error renaming submap:', error);
                                                            action.setError('Could not rename this submap. Please try again.');
                                                            return;
                                                        }

                                                        setMaps(prevMaps => prevMaps.map(map => map.id === renamingSubmap.mapId ? {
                                                            ...map,
                                                            submaps: map.submaps.map(submap =>
                                                                submap.id === renamingSubmap.submapId ? {
                                                                    ...submap,
                                                                    name: updatedName
                                                                }
                                                                : submap
                                                            )
                                                        }
                                                        : map
                                                        ));

                                                        setRenamingSubmap(null);
                                                        setNewSubmapName('');
                                                    })(event)}
                                                >
                                                    Save
                                                </button>
                                            </div>                                     
                                        </div>

                                    </Dialog>
                                )
                            }

                            {deletingSubmap &&
                                deletingSubmap.mapId === map.id &&
                                deletingSubmap.submapId === submap.id && (
                                    <Dialog label="Delete Submap?" onClose={() => setDeletingSubmap(null)} busy={action.busy} error={action.error} onOpen={action.clear}>
                                        <div 
                                            className="delete-popup"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <h3>Delete Submap?</h3>
                                            <p>Are you sure you want to delete "{submap.name}"?</p>

                                            <div className="delete-buttons">
                                                <button
                                                    onClick={() => setDeletingSubmap(null)}
                                                >
                                                    Cancel
                                                </button>

                                                <button
                                                    onClick={event => action.run(async () => {
                                                        const { error } = await supabase
                                                            .from('submaps')
                                                            .delete()
                                                            .eq('id', deletingSubmap.submapId);

                                                        if (error) {
                                                            console.error('Error deleting submap:', error);
                                                            action.setError('Could not delete this submap. Please try again.');
                                                            return;
                                                        }

                                                        setMaps(prevMaps =>
                                                            prevMaps.map(map =>
                                                                map.id === deletingSubmap.mapId
                                                                    ? {
                                                                        ...map,
                                                                        submaps: map.submaps.filter(
                                                                            submap =>
                                                                                submap.id !== deletingSubmap.submapId
                                                                        )
                                                                    }
                                                                    : map
                                                            )
                                                        );

                                                        setDeletingSubmap(null);
                                                    })(event)}
                                                >
                                                    Delete
                                                </button>    
                                            </div>
                                        </div>
                                    </Dialog>
                                )                                     
                            }
                            </OrderableRow>
                                    ))}
                                </div>
                            )}

                            {customizingMap === map.id && (
                                <SidebarMenu anchor={menuAnchor} id="sidebar-actions-menu" label={`Actions for ${map.name}`} onClose={closeMenu}>
                                    {isOwner && (
                                        <>
                                            <button role="menuitem" tabIndex={-1} onClick={(event) => {
                                                event.stopPropagation();
                                                setNewMapName(map.name);
                                                setRenamingMap(map.id);
                                                setCustomizingMap(null);
                                            }}>
                                                Rename
                                            </button>
                                            <button role="menuitem" tabIndex={-1} onClick={(event) => {
                                                event.stopPropagation();
                                                setNewColor(map.color);
                                                setChangingColor({
                                                    mapId: map.id,
                                                    submapId: null
                                                });
                                                setCustomizingMap(null);
                                            }}>
                                                Change color
                                            </button>
                                            <button role="menuitem" tabIndex={-1} onClick={(event) => {
                                                event.stopPropagation();
                                                setSharingMap(map);
                                                setCollaboratorEmail('');
                                                setCollaboratorRole('viewer');
                                                setCustomizingMap(null);
                                            }}>
                                                Invite collaborator
                                            </button>
                                       
                                    </>
                                    )}
                                    <button role="menuitem" tabIndex={-1} onClick={(event) => {
                                        event.stopPropagation();
                                        collaboratorsReturnFocus.current = menuAnchor;
                                        setViewingCollaborators(map);
                                        setCustomizingMap(null);
                                    }}>
                                        View collaborators
                                    </button>
                                    {canEdit && (
                                        <button role="menuitem" tabIndex={-1} onClick={(event) => {
                                            event.stopPropagation();
                                            setNewSubmapName('');
                                            setAddingSubmap(map.id);
                                            setCustomizingMap(null);
                                        }}>
                                            Add submap
                                        </button>
                                    )}
                                    {isOwner && (
                                    <>
                                        <button role="menuitem" tabIndex={-1} className="sidebar-menu-danger" onClick={(event) => {
                                            event.stopPropagation();
                                            setDeletingMap(map.id);
                                            setCustomizingMap(null);
                                        }}>
                                            Delete
                                        </button>
                                    </>
                                )}
                                    {canLeave && (
                                        <button role="menuitem" tabIndex={-1} className="sidebar-menu-danger" onClick={(event) => {
                                            event.stopPropagation();
                                            setLeavingMap(map.id);
                                            setCustomizingMap(null);
                                        }}>
                                            Leave map
                                        </button>
                                    )}
                                </SidebarMenu>
                            )}

                            {leavingMap === map.id && canLeave && (
                                <Dialog label="Leave Map?" onClose={() => setLeavingMap(null)} busy={action.busy} error={action.error} onOpen={action.clear}>
                                    <div className="delete-popup" onClick={(event) => event.stopPropagation()}>
                                        <h3>Leave Map?</h3>
                                        <p>Leave "{map.name}"? You will lose access. The map and its contents will remain for everyone else.</p>
                                        <div className="delete-buttons">
                                            <button disabled={leavingMapId !== null} onClick={() => setLeavingMap(null)}>
                                                Cancel
                                            </button>
                                            <button disabled={leavingMapId !== null} onClick={event => action.run(async () => {
                                                const success = await onLeaveMap(map.id);
                                                if (!success) return;

                                                setExpandedMaps(prev => prev.filter(id => id !== map.id));
                                                setCustomizingSubmap(null);
                                                setRenamingSubmap(null);
                                                setDeletingSubmap(null);
                                                setChangingColor(null);
                                                setAddingSubmap(null);
                                                setLeavingMap(null);
                                            })(event)}>
                                                {leavingMapId === map.id ? 'Leaving...' : 'Leave Map'}
                                            </button>
                                        </div>
                                    </div>
                                </Dialog>
                            )}

                            {/*shows the change color popup for the matching map id.*/}
                            {changingColor &&
                            changingColor.mapId === map.id && (
                                <Dialog label="Change Color" onClose={() => setChangingColor(null)} busy={action.busy} error={action.error} onOpen={action.clear}>
                                    <div 
                                        className="rename-popup"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <h3>Change Color</h3>

                                        <ColorPicker value={newColor} onChange={setNewColor} disabled={action.busy} />

                                        <div className="rename-buttons">
                                            <button onClick={() => setChangingColor(null)}>
                                                Cancel
                                            </button>

                                            <button disabled={!normalizeHex(newColor)} onClick={event => action.run(async () => {
                                                if (!normalizeHex(newColor)) return;
                                                if (changingColor.submapId !== null) {
                                                    const { error } = await supabase
                                                        .from('submaps')
                                                        .update({ color: normalizeHex(newColor) })
                                                        .eq('id', changingColor.submapId);

                                                    if (error) {
                                                        console.error('Error changing submap color:', error);
                                                        action.setError('Could not save this color. Please try again.');
                                                        return;
                                                    }

                                                    setMaps(prevMaps =>
                                                        prevMaps.map(map =>
                                                            map.id === changingColor.mapId
                                                                ? {
                                                                    ...map,
                                                                    submaps: map.submaps.map(submap =>
                                                                        submap.id === changingColor.submapId
                                                                            ? { ...submap, color: normalizeHex(newColor) }
                                                                            : submap
                                                                    )
                                                                }
                                                                : map
                                                        )
                                                    );
                                                } else {
                                                    const { error } = await supabase
                                                        .from('maps')
                                                        .update({ color: normalizeHex(newColor) })
                                                        .eq('id', changingColor.mapId);

                                                    if (error) {
                                                        console.error('Error changing map color:', error);
                                                        action.setError('Could not save this color. Please try again.');
                                                        return;
                                                    }

                                                    setMaps(prevMaps =>
                                                        prevMaps.map(map =>
                                                            map.id === changingColor.mapId
                                                                ? { ...map, color: normalizeHex(newColor) }
                                                                : map
                                                        )
                                                    );
                                                }

                                                setChangingColor(null);
                                            })(event)}>
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                </Dialog>
                            )}

                            {/*shows the rename popup for the matching map id.*/}
                            {renamingMap === map.id && (
                                <Dialog label="Rename Map" onClose={() => setRenamingMap(null)} busy={action.busy} error={action.error} onOpen={action.clear}>
                                    <div className="rename-popup">
                                        <h3>Rename Map</h3>
                                        <input 
                                        type="text"
                                        placeholder="Enter new map name."
                                        value={newMapName}
                                        onChange={(event) => setNewMapName(event.target.value)}
                                        />
                                        <div className="rename-buttons">
                                            <button onClick={() => setRenamingMap(null)}>
                                                Cancel
                                            </button>
                                            <button onClick={event => action.run(async () => {
                                                if (newMapName.trim() === '') { action.setError('Please enter a name.'); return; }

                                                const updatedName = newMapName.trim();

                                                const { error } = await supabase
                                                    .from('maps')
                                                    .update({ name: updatedName })
                                                    .eq('id', renamingMap);

                                                if (error) {
                                                    console.error('Error renaming map:', error);
                                                    action.setError('Could not rename this map. Please try again.');
                                                    return;
                                                }

                                                setMaps(prevMaps =>
                                                    prevMaps.map(map =>
                                                        map.id === renamingMap
                                                            ? { ...map, name: updatedName }
                                                            : map
                                                    )
                                                );

                                                setRenamingMap(null);
                                            })(event)}>
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                </Dialog>
                            )}

                            {/*Shows the delete popup for the matching map id.*/}
                            {deletingMap === map.id && (
                                <Dialog label="Delete Map?" onClose={() => setDeletingMap(null)} busy={action.busy} error={action.error} onOpen={action.clear}>
                                    <div className="delete-popup">
                                        <h3>Delete Map?</h3>
                                        <p>Are you sure you want to delete "{map.name}"?</p>

                                        <div className="delete-buttons">
                                            <button onClick={() =>  setDeletingMap(null)}>
                                                Cancel
                                            </button>

                                            <button onClick={event => action.run(async () => {
                                                const { error } = await supabase
                                                    .from('maps')
                                                    .delete()
                                                    .eq('id', deletingMap);

                                                if (error) {
                                                    console.error('Error deleting map:', error);
                                                    action.setError('Could not delete this map. Please try again.');
                                                    return;
                                                }

                                                setMaps(prevMaps =>
                                                    prevMaps.filter(map => map.id !== deletingMap)
                                                );

                                                setDeletingMap(null);
                                            })(event)}>
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </Dialog>
                            )}

                            {/*Shows the sharing map popup to add to the matching map id.*/}
                            {sharingMap && sharingMap.id === map.id && (
                                <Dialog label="Invite Collaborator" onClose={() => setSharingMap(null)} busy={action.busy} error={action.error} onOpen={action.clear}>
                                    <div
                                        className="rename-popup collaboration-dialog invite-collaborator"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <div className="collaboration-header">
                                            <h3>Invite Collaborator</h3>
                                            <button type="button" className="collaboration-close" aria-label="Close invite collaborator" onClick={() => setSharingMap(null)}>×</button>
                                        </div>
                                        <p className="collaboration-context">{sharingMap.name}</p>
                                        <label htmlFor={`collaborator-email-${map.id}`}>Email</label>

                                        <input
                                            id={`collaborator-email-${map.id}`} type="email" autoComplete="email" autoFocus
                                            placeholder="Enter user's email"
                                            value={collaboratorEmail}
                                            onChange={(event) =>
                                                setCollaboratorEmail(event.target.value)
                                            }
                                        />

                                        <label htmlFor={`collaborator-role-${map.id}`}>Role</label>
                                        <select
                                            id={`collaborator-role-${map.id}`}
                                            aria-describedby={`collaborator-role-help-${map.id}`}
                                            value={collaboratorRole}
                                            onChange={(event) => setCollaboratorRole(event.target.value)}
                                        >
                                            <option value="viewer">Viewer</option>
                                            <option value="editor">Editor</option>
                                        </select>
                                        <p id={`collaborator-role-help-${map.id}`} className="collaboration-help">Viewer: view maps and pins. Editor: manage pins and submaps.</p>

                                        <div className="rename-buttons collaboration-actions">
                                            <button
                                                onClick={() => {
                                                    setSharingMap(null);
                                                    setCollaboratorEmail('');
                                                    setCollaboratorRole('viewer');
                                                }}
                                            >
                                                Cancel
                                            </button>

                                            <button className="collaboration-primary"
                                                onClick={event => action.run(async () => {
                                                    if (collaboratorEmail.trim() === '') { action.setError('Please enter an email address.'); return; }

                                                    const { error } = await supabase.rpc(
                                                        'invite_map_collaborator',
                                                        {
                                                            invite_map_id: sharingMap.id,
                                                            invite_email: collaboratorEmail.trim(),
                                                            invite_role: collaboratorRole
                                                        }
                                                    );

                                                    if (error) {
                                                        console.error(
                                                            'Error inviting collaborator:',
                                                            JSON.stringify(error, null, 2)
                                                        );
                                                        action.setError(error.message || 'Could not send this invitation. Please try again.');
                                                        return;
                                                    }

                                                    setNotice('Invitation sent.');

                                                    setSharingMap(null);
                                                    setCollaboratorEmail('');
                                                    setCollaboratorRole('viewer');
                                                })(event)}
                                            >
                                                Invite
                                            </button>
                                        </div>
                                    </div>
                                </Dialog>
                            )}

                            {/*Shows the adding submap popup to add to the matching map id.*/}
                            {addingSubmap === map.id && (
                                <Dialog label="Add Submap" onClose={() => setAddingSubmap(null)} busy={action.busy} error={action.error} onOpen={action.clear}>
                                    <div 
                                        className="rename-popup"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <h3>Add Submap</h3>

                                        <input
                                            type="text"
                                            placeholder="Enter submap name"
                                            value={newSubmapName}
                                            onChange={(event) => setNewSubmapName(event.target.value)}
                                        />

                                        <div className="rename-buttons">
                                            <button onClick={() => setAddingSubmap(null)}>
                                                    Cancel
                                            </button>
                                            <button
                                                onClick={event => action.run(async () => {
                                                    if (newSubmapName.trim() === '') { action.setError('Please enter a name.'); return; }

                                                    const updatedName = newSubmapName.trim();

                                                    const { data: lastSubmap, error: orderError } = await supabase
                                                        .from('submaps')
                                                        .select('sort_order')
                                                        .eq('map_id', addingSubmap)
                                                        .order('sort_order', { ascending: false })
                                                        .limit(1)
                                                        .maybeSingle();

                                                    if (orderError) {
                                                        console.error('Error finding submap order:', orderError);
                                                        action.setError('Could not prepare the new submap. Please try again.');
                                                        return;
                                                    }

                                                    const newSortOrder = lastSubmap
                                                        ? lastSubmap.sort_order + 1
                                                        : 0;

                                                    const { data: newSubmap, error } = await supabase
                                                        .from('submaps')
                                                        .insert({
                                                            map_id: addingSubmap,
                                                            name: updatedName,
                                                            color: '#3388ff',
                                                            sort_order: newSortOrder
                                                        })
                                                        .select()
                                                        .single();

                                                    if (error) {
                                                        console.error('Error creating submap:', error);
                                                        action.setError('Could not create this submap. Please try again.');
                                                        return;
                                                    }

                                                    setMaps(prevMaps =>
                                                        prevMaps.map(map =>
                                                            map.id === addingSubmap
                                                                ? {
                                                                    ...map,
                                                                    submaps: [
                                                                        ...map.submaps,
                                                                        {
                                                                            id: newSubmap.id,
                                                                            name: newSubmap.name,
                                                                            visible: false,
                                                                            color: newSubmap.color,
                                                                            sortOrder: newSubmap.sort_order
                                                                        }
                                                                    ]
                                                                }
                                                                : map
                                                        )
                                                    );

                                                    setAddingSubmap(null);
                                                    setNewSubmapName('');
                                                })(event)}
                                            >
                                                Create
                                            </button>
                                        </div>
                                    </div>
                                </Dialog>
                            )}
                        </div>
                        );    
                    })}
                </div>
                </DragDropProvider>
                <button className="add-map-button" 
                    onClick={(event) => {
                        event.stopPropagation();
                        setNewMapName('');
                        setAddingMap(true);
                        setCustomizingMap(null);
                    }}
                >
                    Add Map
                </button>

                {addingMap && (
                    <Dialog label="Add Map" onClose={() => setAddingMap(false)} busy={action.busy} error={action.error} onOpen={action.clear}>
                        <div className="rename-popup">
                            <h3>Add Map</h3>

                            <input
                                type="text"
                                placeholder="Enter map name"
                                value={newMapName}
                                onChange={(event) => setNewMapName(event.target.value)}
                            />
                        

                            <div className="rename-buttons">
                                <button onClick={() => setAddingMap(false)}
                                > Cancel</button>
                                
                                <button onClick={event => action.run(async () => {
                                    if (newMapName.trim() === '') { action.setError('Please enter a name.'); return; }

                                    const updatedName = newMapName.trim();

                                    const { data: lastMap, error: orderError } = await supabase
                                        .from('maps')
                                        .select('sort_order')
                                        .order('sort_order', { ascending: false })
                                        .limit(1)
                                        .maybeSingle();

                                    if (orderError) {
                                        console.error('Error finding map order:', orderError);
                                        action.setError('Could not prepare the new map. Please try again.');
                                        return;
                                    }

                                    const newSortOrder = lastMap
                                        ? lastMap.sort_order + 1
                                        : 0;

                                    const { data: newMap, error } = await supabase
                                        .from('maps')
                                        .insert({
                                            name: updatedName,
                                            user_id: (await supabase.auth.getUser()).data.user.id,
                                            color: '#3388ff',
                                            is_default: false,
                                            sort_order: newSortOrder
                                        })
                                        .select()
                                        .single();

                                    if (error) {
                                        console.error('Error creating map:', error);
                                        action.setError('Could not create this map. Please try again.');
                                        return;
                                    }

                                    setMaps(prevMaps => [
                                        ...prevMaps,
                                        {
                                            id: newMap.id,
                                            name: newMap.name,
                                            visible: false,
                                            isDefault: newMap.is_default,
                                            color: newMap.color,
                                            sortOrder: newMap.sort_order,
                                            role: 'owner',
                                            submaps: []
                                        }
                                    ]);

                                    setAddingMap(false);
                                    setNewMapName('');
                                })(event)}>
                                    Create
                                </button>
                            </div>
                        </div>
                    </Dialog>
                )}

            </div>
            
            {viewingCollaborators && <CollaboratorsModal
                map={viewingCollaborators}
                currentUserId={currentUserId}
                returnFocusRef={collaboratorsReturnFocus}
                onClose={() => setViewingCollaborators(null)}
            />}
        </aside>
    )
}

export default MapSidebar;
