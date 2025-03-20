"use client"

import React, { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from "lucide-react"

// This wrapper component adds controlled stacking context
// and injects CSS fixes globally for all map interactions
const MapWrapper = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    // Ensure this runs only once in client-side
    if (typeof window !== 'undefined') {
      // Fix for leaflet map controls and interactions
      const leafletStyles = `
        /* Override Leaflet z-index values globally */
        .leaflet-pane,
        .leaflet-tile,
        .leaflet-marker-icon,
        .leaflet-marker-shadow,
        .leaflet-tile-container,
        .leaflet-map-pane svg,
        .leaflet-map-pane canvas,
        .leaflet-zoom-box,
        .leaflet-image-layer,
        .leaflet-layer {
          z-index: 200 !important;
        }
        
        .leaflet-control {
          z-index: 400 !important;
        }
        
        .leaflet-top,
        .leaflet-bottom {
          z-index: 400 !important;
        }
        
        /* Ensure popovers and dropdowns are above map */
        [data-radix-popper-content-wrapper] {
          z-index: 9000 !important;
        }
        
        /* Ensure map doesn't create a new stacking context that breaks UI */
        .map-container {
          isolation: isolate;
          position: relative;
          z-index: 1;
        }
      `;
      
      // Add styles to document
      const styleElement = document.createElement('style');
      styleElement.textContent = leafletStyles;
      document.head.appendChild(styleElement);
      
      return () => {
        // Clean up when component unmounts
        document.head.removeChild(styleElement);
      };
    }
  }, []);
  
  return (
    <div className="map-wrapper" style={{ position: 'relative', zIndex: 1 }}>
      {children}
    </div>
  );
};

// Dynamically load the wrapped component
const DynamicMapWrapper = ({ children }: { children: React.ReactNode }) => {
  // This ensures the MapWrapper is only loaded client-side
  const DynamicWrapper = dynamic(() => Promise.resolve(MapWrapper), {
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center h-64 border rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    ),
  });
  
  return <DynamicWrapper>{children}</DynamicWrapper>;
};

export default DynamicMapWrapper;
