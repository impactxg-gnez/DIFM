'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, Plus, Edit2, Trash2, Check, X, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface SavedLocation {
    id: string;
    name: string;
    address: string;
    details?: string;
    placeId?: string;
}

interface LocationPickerProps {
    currentLocation: string;
    onLocationChange: (location: string) => void;
    onClose: () => void;
}

export function LocationPicker({ currentLocation, onLocationChange, onClose }: LocationPickerProps) {
    const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<SavedLocation | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [manualDetails, setManualDetails] = useState('');
    const [locationName, setLocationName] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showSavedList, setShowSavedList] = useState(false);
    const [editingLocationId, setEditingLocationId] = useState<string | null>(null);

    const autocompleteService = useRef<any>(null);
    const placesService = useRef<any>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load saved locations from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('savedLocations');
        if (saved) {
            setSavedLocations(JSON.parse(saved));
        }
    }, []);

    // Initialize Google Places Autocomplete
    useEffect(() => {
        if (typeof window !== 'undefined' && window.google) {
            autocompleteService.current = new window.google.maps.places.AutocompleteService();
            const mapDiv = document.createElement('div');
            placesService.current = new window.google.maps.places.PlacesService(mapDiv);
        }
    }, []);

    // Handle search input changes
    const handleSearchChange = (value: string) => {
        setSearchInput(value);

        if (!value.trim() || !autocompleteService.current) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        autocompleteService.current.getPlacePredictions(
            { input: value },
            (predictions: any[], status: any) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
                    setSuggestions(predictions);
                    setShowSuggestions(true);
                } else {
                    setSuggestions([]);
                    setShowSuggestions(false);
                }
            }
        );
    };

    // Handle suggestion selection
    const handleSuggestionSelect = (suggestion: any) => {
        setSearchInput(suggestion.description);
        setShowSuggestions(false);

        // Get place details
        if (placesService.current) {
            placesService.current.getDetails(
                { placeId: suggestion.place_id },
                (place: any, status: any) => {
                    if (status === window.google.maps.places.PlacesServiceStatus.OK) {
                        setSelectedLocation({
                            id: Date.now().toString(),
                            name: '',
                            address: suggestion.description,
                            placeId: suggestion.place_id
                        });
                    }
                }
            );
        }
    };

    // Save location
    const handleSaveLocation = () => {
        if (!searchInput.trim()) return;

        const newLocation: SavedLocation = {
            id: editingLocationId || Date.now().toString(),
            name: locationName.trim() || 'Unnamed Location',
            address: searchInput,
            details: manualDetails.trim() || undefined,
            placeId: selectedLocation?.placeId
        };

        let updatedLocations: SavedLocation[];
        if (editingLocationId) {
            updatedLocations = savedLocations.map(loc =>
                loc.id === editingLocationId ? newLocation : loc
            );
        } else {
            updatedLocations = [...savedLocations, newLocation];
        }

        setSavedLocations(updatedLocations);
        localStorage.setItem('savedLocations', JSON.stringify(updatedLocations));

        // Set as current location
        const fullAddress = manualDetails
            ? `${manualDetails}, ${searchInput}`
            : searchInput;
        onLocationChange(fullAddress);

        // Reset form
        setSearchInput('');
        setManualDetails('');
        setLocationName('');
        setSelectedLocation(null);
        setEditingLocationId(null);
        onClose();
    };

    // Select saved location
    const handleSelectSavedLocation = (location: SavedLocation) => {
        const fullAddress = location.details
            ? `${location.details}, ${location.address}`
            : location.address;
        onLocationChange(fullAddress);
        setShowSavedList(false);
        onClose();
    };

    // Edit saved location
    const handleEditLocation = (location: SavedLocation) => {
        setEditingLocationId(location.id);
        setSearchInput(location.address);
        setManualDetails(location.details || '');
        setLocationName(location.name);
        setShowSavedList(false);
    };

    // Delete saved location
    const handleDeleteLocation = (id: string) => {
        const updatedLocations = savedLocations.filter(loc => loc.id !== id);
        setSavedLocations(updatedLocations);
        localStorage.setItem('savedLocations', JSON.stringify(updatedLocations));
    };

    return (
        <div className="bg-zinc-900 border border-blue-500/50 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-500" />
                    {editingLocationId ? 'Edit Location' : 'Select Location'}
                </h3>
                <Button size="sm" variant="ghost" onClick={onClose} className="h-6 w-6 p-0">
                    <X className="w-4 h-4 text-gray-400" />
                </Button>
            </div>

            {/* Saved Locations Dropdown */}
            {savedLocations.length > 0 && !editingLocationId && (
                <div className="space-y-2">
                    <Button
                        variant="outline"
                        className="w-full justify-between bg-zinc-800 border-white/10 text-white hover:bg-zinc-700"
                        onClick={() => setShowSavedList(!showSavedList)}
                    >
                        <span className="text-sm">Saved Locations ({savedLocations.length})</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showSavedList ? 'rotate-180' : ''}`} />
                    </Button>

                    {showSavedList && (
                        <div className="bg-zinc-800 border border-white/10 rounded-lg p-2 space-y-1 max-h-48 overflow-y-auto">
                            {savedLocations.map(location => (
                                <div
                                    key={location.id}
                                    className="flex items-center justify-between p-2 hover:bg-zinc-700 rounded group"
                                >
                                    <div
                                        className="flex-1 cursor-pointer"
                                        onClick={() => handleSelectSavedLocation(location)}
                                    >
                                        <p className="text-sm font-medium text-white">{location.name}</p>
                                        <p className="text-xs text-gray-400">
                                            {location.details && `${location.details}, `}{location.address}
                                        </p>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleEditLocation(location)}
                                            className="h-6 w-6 p-0 text-blue-400 hover:text-blue-300"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDeleteLocation(location.id)}
                                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Google Places Search */}
            <div className="space-y-2">
                <Label className="text-xs text-gray-400">Search Address</Label>
                <div className="relative">
                    <Input
                        ref={inputRef}
                        value={searchInput}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Start typing an address..."
                        className="bg-zinc-800 border-white/10 text-white"
                        autoFocus={!editingLocationId}
                    />

                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-white/10 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {suggestions.map((suggestion) => (
                                <div
                                    key={suggestion.place_id}
                                    className="p-3 hover:bg-zinc-700 cursor-pointer border-b border-white/5 last:border-0"
                                    onClick={() => handleSuggestionSelect(suggestion)}
                                >
                                    <p className="text-sm text-white">{suggestion.structured_formatting.main_text}</p>
                                    <p className="text-xs text-gray-400">{suggestion.structured_formatting.secondary_text}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <p className="text-xs text-gray-500">Powered by Google Places</p>
            </div>

            {/* Manual Details */}
            <div className="space-y-2">
                <Label className="text-xs text-gray-400">Additional Details (Optional)</Label>
                <Input
                    value={manualDetails}
                    onChange={(e) => setManualDetails(e.target.value)}
                    placeholder="e.g., Flat 2B, Shop 5, Building C"
                    className="bg-zinc-800 border-white/10 text-white"
                />
            </div>

            {/* Location Name (for saving) */}
            <div className="space-y-2">
                <Label className="text-xs text-gray-400">Save as (Optional)</Label>
                <Input
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="e.g., Home, Office, Gym"
                    className="bg-zinc-800 border-white/10 text-white"
                />
                <p className="text-xs text-gray-500">Give this location a name to save it for later</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
                <Button
                    variant="outline"
                    onClick={onClose}
                    className="flex-1 bg-zinc-800 border-white/10 text-white hover:bg-zinc-700"
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSaveLocation}
                    disabled={!searchInput.trim()}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                    <Check className="w-4 h-4 mr-2" />
                    {editingLocationId ? 'Update' : 'Save & Use'}
                </Button>
            </div>
        </div>
    );
}
