# Frontend Integration Guide: Guest Token System

This guide explains how to integrate the guest token system into your frontend application to enable cart functionality for anonymous users.

## Overview

The guest token system allows anonymous users to reserve and release stock items without requiring authentication or phone numbers. Each anonymous session is identified by a unique token (UUID) that is:
- Generated on first visit
- Stored in HTTP-only cookie (secure)
- Also stored in localStorage (for easy frontend access)
- Sent with all reservation requests

## Setup Steps

### 1. Initialize Guest Token on App Load

Call the guest token endpoint when your application starts (e.g., in `App.js`, `main.js`, or root component):

```javascript
// utils/cart.js

let guestToken = null;

/**
 * Initialize guest token for anonymous session tracking
 * Call this on app startup
 */
export async function initializeGuestToken() {
  try {
    // Check localStorage first
    guestToken = localStorage.getItem('guestToken');
    
    if (!guestToken) {
      // Get token from backend
      const response = await fetch('/api/stock-reservation/guest-token', {
        method: 'GET',
        credentials: 'include', // Important: include cookies
      });
      
      if (!response.ok) {
        throw new Error('Failed to get guest token');
      }
      
      const data = await response.json();
      guestToken = data.guestToken;
      
      // Store in localStorage for easy access
      localStorage.setItem('guestToken', guestToken);
    }
    
    return guestToken;
  } catch (error) {
    console.error('Failed to initialize guest token:', error);
    return null;
  }
}

/**
 * Get current guest token
 */
export function getGuestToken() {
  return guestToken;
}

/**
 * Clear guest token (on logout or manual reset)
 */
export function clearGuestToken() {
  guestToken = null;
  localStorage.removeItem('guestToken');
}
```

**React Example (App.js):**
```javascript
import React, { useEffect, useState } from 'react';
import { initializeGuestToken } from './utils/cart';

function App() {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      await initializeGuestToken();
      setIsInitialized(true);
    };
    
    init();
  }, []);

  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return (
    <div className="App">
      {/* Your app content */}
    </div>
  );
}

export default App;
```

**Vue Example (main.js):**
```javascript
import { createApp } from 'vue';
import App from './App.vue';
import { initializeGuestToken } from './utils/cart';

const app = createApp(App);

initializeGuestToken().then(() => {
  app.mount('#app');
});
```

---

### 2. Add Item to Cart (Reserve Stock)

When a user adds an item to their cart, reserve the stock:

```javascript
// utils/cart.js

/**
 * Reserve stock for a product variant
 * @param {number} variantId - Product variant ID
 * @param {number} quantity - Quantity to reserve
 * @returns {Promise<Object>} Reservation result
 */
export async function addToCart(variantId, quantity) {
  const token = getGuestToken();
  
  if (!token) {
    throw new Error('Guest token not initialized');
  }

  const response = await fetch('/api/stock-reservation/reserve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for auth
    body: JSON.stringify({
      variantId,
      quantity,
      guestToken: token,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to add to cart');
  }

  return data;
}
```

**Usage Example:**
```javascript
import { addToCart } from './utils/cart';

// In your product component
const handleAddToCart = async (variantId, quantity) => {
  try {
    const result = await addToCart(variantId, quantity);
    console.log('Added to cart:', result);
    // Show success message
    // Update cart count
  } catch (error) {
    console.error('Failed to add to cart:', error.message);
    // Show error message to user
  }
};
```

**Error Handling:**
- `400`: Invalid quantity or missing token → Show validation error
- `404`: Variant not found → Show "product unavailable" message
- `409`: Insufficient stock → Show "only X items available" message

---

### 3. Remove Item from Cart (Release Reservation)

When a user removes an item from their cart, release the reservation:

```javascript
// utils/cart.js

/**
 * Release a reservation (remove from cart)
 * @param {number} reservationId - Reservation ID to release
 * @returns {Promise<Object>} Release result
 */
export async function removeFromCart(reservationId) {
  const token = getGuestToken();
  
  if (!token) {
    throw new Error('Guest token not initialized');
  }

  const response = await fetch('/api/stock-reservation/release', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      reservationId,
      guestToken: token,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to remove from cart');
  }

  return data;
}
```

**Usage Example:**
```javascript
import { removeFromCart } from './utils/cart';

// In your cart component
const handleRemoveItem = async (reservationId) => {
  try {
    await removeFromCart(reservationId);
    // Remove item from local cart state
    setCartItems(prev => prev.filter(item => item.reservationId !== reservationId));
    // Show success message or update UI
  } catch (error) {
    console.error('Failed to remove item:', error.message);
    // Item may have already been released (idempotent)
    // Still remove from local cart state
    setCartItems(prev => prev.filter(item => item.reservationId !== reservationId));
  }
};
```

**Note on Idempotency:**
The release endpoint is idempotent. If a user clicks "remove" twice or the request is retried, it will return success even if the reservation was already released. This prevents errors from breaking the user experience.

---

### 4. Get Active Reservations

Fetch the user's active reservations to display in the cart:

```javascript
// utils/cart.js

/**
 * Get active reservations for current user/guest
 * @returns {Promise<Array>} List of reservations
 */
export async function getActiveReservations() {
  const token = getGuestToken();
  
  const url = new URL('/api/stock-reservation/my-reservations', window.location.origin);
  if (token) {
    url.searchParams.append('guestToken', token);
  }

  const response = await fetch(url, {
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to fetch reservations');
  }

  return data.data;
}
```

**Usage Example:**
```javascript
import { getActiveReservations } from './utils/cart';

// In your cart page
const [cartItems, setCartItems] = useState([]);

useEffect(() => {
  const loadCart = async () => {
    try {
      const reservations = await getActiveReservations();
      setCartItems(reservations);
    } catch (error) {
      console.error('Failed to load cart:', error.message);
    }
  };
  
  loadCart();
}, []);
```

---

### 5. Check Stock Availability

Check if a product is in stock before adding to cart:

```javascript
// utils/cart.js

/**
 * Check if a variant is available in the requested quantity
 * @param {number} variantId - Product variant ID
 * @param {number} quantity - Quantity to check
 * @returns {Promise<Object>} Availability result
 */
export async function checkAvailability(variantId, quantity) {
  const response = await fetch('/api/stock-reservation/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      variantId,
      quantity,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to check availability');
  }

  return data;
}
```

**Usage Example:**
```javascript
import { checkAvailability } from './utils/cart';

const handleAddToCart = async (variantId, quantity) => {
  try {
    // Check availability first
    const availability = await checkAvailability(variantId, quantity);
    
    if (!availability.available) {
      alert(availability.message); // "Only X items available"
      return;
    }
    
    // Proceed with reservation
    await addToCart(variantId, quantity);
  } catch (error) {
    console.error('Failed to add to cart:', error.message);
  }
};
```

---

### 6. Handle User Login (Migrate Reservations)

When a guest user logs in, you may want to migrate their reservations to their user account:

```javascript
// utils/cart.js

/**
 * Migrate guest reservations to user account after login
 * @param {string} jwtToken - User's JWT token
 * @returns {Promise<void>}
 */
export async function migrateGuestReservations(jwtToken) {
  const guestToken = getGuestToken();
  
  if (!guestToken) {
    return; // No guest reservations to migrate
  }

  try {
    await fetch('/api/stock-reservation/migrate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
      credentials: 'include',
      body: JSON.stringify({
        guestToken,
      }),
    });
    
    // Clear guest token after migration
    clearGuestToken();
  } catch (error) {
    console.error('Failed to migrate reservations:', error.message);
    // Reservations will remain under guest token
    // They can still be accessed with the token
  }
}
```

**Usage Example:**
```javascript
import { migrateGuestReservations } from './utils/cart';

// After successful login
const handleLogin = async (email, password) => {
  try {
    const response = await login(email, password); // Your login API
    const { token, user } = response.data;
    
    // Store JWT
    localStorage.setItem('jwtToken', token);
    
    // Migrate guest reservations
    await migrateGuestReservations(token);
    
    // Redirect to dashboard
  } catch (error) {
    console.error('Login failed:', error.message);
  }
};
```

---

## Complete Example: Shopping Cart Component

```javascript
import React, { useState, useEffect } from 'react';
import { 
  getActiveReservations, 
  removeFromCart,
  checkAvailability 
} from './utils/cart';

function ShoppingCart() {
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load cart on mount
  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = async () => {
    try {
      setLoading(true);
      const reservations = await getActiveReservations();
      setCartItems(reservations);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (reservationId) => {
    try {
      await removeFromCart(reservationId);
      // Optimistically update UI
      setCartItems(prev => prev.filter(item => item.id !== reservationId));
    } catch (err) {
      // Item may have already been released (idempotent)
      // Still remove from UI
      setCartItems(prev => prev.filter(item => item.id !== reservationId));
    }
  };

  const handleQuantityChange = async (reservationId, variantId, newQuantity) => {
    if (newQuantity < 1) return;

    try {
      // Check availability
      const availability = await checkAvailability(variantId, newQuantity);
      
      if (!availability.available) {
        alert(availability.message);
        return;
      }

      // Remove old reservation
      await removeFromCart(reservationId);
      
      // Add new reservation with updated quantity
      // (You'll need to implement addToCart)
      // await addToCart(variantId, newQuantity);
      
      // Reload cart
      await loadCart();
    } catch (err) {
      console.error('Failed to update quantity:', err.message);
    }
  };

  if (loading) return <div>Loading cart...</div>;
  if (error) return <div>Error: {error}</div>;
  if (cartItems.length === 0) return <div>Your cart is empty</div>;

  return (
    <div className="shopping-cart">
      <h2>Your Cart</h2>
      <ul>
        {cartItems.map(item => (
          <li key={item.id} className="cart-item">
            <img 
              src={item.variant.product.image} 
              alt={item.variant.product.name}
              width="50"
            />
            <div className="item-details">
              <h3>{item.variant.product.name}</h3>
              <p>SKU: {item.variant.sku}</p>
              <p>Price: ${item.variant.price}</p>
            </div>
            <div className="item-quantity">
              <button onClick={() => handleQuantityChange(
                item.id, 
                item.variant.id, 
                item.quantity - 1
              )}>
                -
              </button>
              <span>{item.quantity}</span>
              <button onClick={() => handleQuantityChange(
                item.id, 
                item.variant.id, 
                item.quantity + 1
              )}>
                +
              </button>
            </div>
            <button 
              onClick={() => handleRemoveItem(item.id)}
              className="remove-btn"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ShoppingCart;
```

---

## Best Practices

### 1. Always Include Credentials
```javascript
credentials: 'include'  // Required for cookies and auth
```

### 2. Handle Idempotency Gracefully
The release endpoint is idempotent. If a reservation is already released:
- The API returns success (not error)
- Your UI should handle this gracefully
- Remove the item from local state even on "error"

### 3. Store Token Securely
- Token is stored in HTTP-only cookie (secure)
- Also store in localStorage for easy access
- Clear token on logout

### 4. Check Availability Before Adding
Always check stock availability before attempting to reserve:
```javascript
const availability = await checkAvailability(variantId, quantity);
if (!availability.available) {
  alert(availability.message);
  return;
}
await addToCart(variantId, quantity);
```

### 5. Handle Expired Reservations
Reservations expire after 15 minutes. Handle gracefully:
- If reservation is expired, it will be auto-released
- User may see "item no longer available" message
- Allow them to re-add if stock is available

### 6. Migrate on Login
When a guest user logs in:
- Migrate their reservations to their account
- Clear the guest token
- Continue seamless shopping experience

---

## Troubleshooting

### Issue: "Guest token not initialized"
**Solution:** Call `initializeGuestToken()` on app startup before any cart operations.

### Issue: "Reservation not found" on release
**Solution:** Reservation may have already been released (idempotent). Remove from local cart state.

### Issue: "Insufficient stock" on reserve
**Solution:** Stock may have been reserved by another user. Check current availability and retry.

### Issue: CORS errors
**Solution:** Ensure `credentials: 'include'` is set in all fetch requests.

### Issue: Token not persisting
**Solution:** Check that cookies are enabled. Token is stored in both cookie and localStorage.

---

## API Reference

See [API Documentation](../API_DOCUMENTATION.md) for complete API reference.

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stock-reservation/guest-token` | GET | Get guest token |
| `/api/stock-reservation/reserve` | POST | Reserve stock |
| `/api/stock-reservation/release` | POST | Release reservation |
| `/api/stock-reservation/my-reservations` | GET | Get active reservations |
| `/api/stock-reservation/check` | POST | Check availability |

---

## Support

For issues or questions:
1. Check browser console for errors
2. Verify API is running and accessible
3. Check network tab for failed requests
4. Review API documentation for error codes