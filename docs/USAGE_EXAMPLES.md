# Usage Examples

This document provides practical examples of using the E-commerce Backend API in various scenarios.

## Table of Contents
- [Getting Started](#getting-started)
- [Authentication Examples](#authentication-examples)
- [Product Management](#product-management)
- [Order Management](#order-management)
- [User Management](#user-management)
- [Address Management](#address-management)
- [Category Management](#category-management)
- [Common Workflows](#common-workflows)
- [Client Integration](#client-integration)

---

## Getting Started

### Base URL

All examples use the following base URL:
```
http://localhost:5000/api
```

### Tools Used

Examples are provided for:
- **cURL** - Command line
- **JavaScript/Fetch** - Browser/Node.js
- **Axios** - Popular HTTP client

---

## Authentication Examples

### Example 1: Customer Registration

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "Customer123"
  }'
```

**JavaScript (Fetch):**
```javascript
const signUp = async () => {
  const response = await fetch('http://localhost:5000/api/auth/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'customer@example.com',
      password: 'Customer123'
    })
  });
  
  const data = await response.json();
  
  // Save token for future requests
  localStorage.setItem('token', data.access_token);
  
  return data;
};
```

**Axios:**
```javascript
import axios from 'axios';

const signUp = async () => {
  const { data } = await axios.post('http://localhost:5000/api/auth/signup', {
    email: 'customer@example.com',
    password: 'Customer123'
  });
  
  // Save token
  localStorage.setItem('token', data.access_token);
  
  return data;
};
```

### Example 2: Customer Login

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "Customer123"
  }'
```

**JavaScript:**
```javascript
const login = async (email, password) => {
  const response = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  
  if (!response.ok) {
    throw new Error('Login failed');
  }
  
  const data = await response.json();
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  return data;
};
```

### Example 3: Admin Login

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123"
  }'
```

**JavaScript:**
```javascript
const adminLogin = async (email, password) => {
  const { data } = await axios.post('http://localhost:5000/api/auth/admin/login', {
    email,
    password
  });
  
  // Store admin token separately
  sessionStorage.setItem('adminToken', data.access_token);
  
  return data;
};
```

---

## Product Management

### Example 4: Get All Products

**cURL:**
```bash
curl -X GET http://localhost:5000/api/products
```

**JavaScript:**
```javascript
const getProducts = async () => {
  const response = await fetch('http://localhost:5000/api/products');
  const products = await response.json();
  
  return products;
};
```

**React Component:**
```javascript
import { useState, useEffect } from 'react';

function ProductList() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch('http://localhost:5000/api/products')
      .then(res => res.json())
      .then(data => {
        setProducts(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error:', error);
        setLoading(false);
      });
  }, []);
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      {products.map(product => (
        <div key={product.id}>
          <h3>{product.name}</h3>
          <p>{product.description}</p>
          <p>Price: ${product.variants[0]?.price}</p>
        </div>
      ))}
    </div>
  );
}
```

### Example 5: Get Product by ID

**cURL:**
```bash
curl -X GET http://localhost:5000/api/products/1
```

**JavaScript:**
```javascript
const getProduct = async (productId) => {
  const response = await fetch(`http://localhost:5000/api/products/${productId}`);
  
  if (!response.ok) {
    throw new Error('Product not found');
  }
  
  return await response.json();
};
```

### Example 6: Create Product (Admin Only)

**cURL:**
```bash
curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Classic T-Shirt",
    "slug": "classic-t-shirt",
    "description": "Comfortable cotton t-shirt",
    "categoryId": 1,
    "isActive": true,
    "variants": [
      {
        "sku": "TS-001-S-BLK",
        "price": 29.99,
        "stock": 50,
        "attributes": [
          {
            "attributeName": "Size",
            "attributeValue": "Small"
          },
          {
            "attributeName": "Color",
            "attributeValue": "Black"
          }
        ]
      }
    ],
    "images": [
      {
        "url": "https://example.com/image.jpg",
        "altText": "Classic T-Shirt",
        "position": 1
      }
    ]
  }'
```

**JavaScript:**
```javascript
const createProduct = async (productData) => {
  const token = localStorage.getItem('adminToken');
  
  const response = await fetch('http://localhost:5000/api/products', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(productData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return await response.json();
};

// Usage
const newProduct = {
  name: "Classic T-Shirt",
  slug: "classic-t-shirt",
  description: "Comfortable cotton t-shirt",
  categoryId: 1,
  isActive: true,
  variants: [
    {
      sku: "TS-001-S-BLK",
      price: 29.99,
      stock: 50,
      attributes: [
        { attributeName: "Size", attributeValue: "Small" },
        { attributeName: "Color", attributeValue: "Black" }
      ]
    }
  ],
  images: [
    {
      url: "https://example.com/image.jpg",
      altText: "Classic T-Shirt",
      position: 1
    }
  ]
};

createProduct(newProduct)
  .then(product => console.log('Product created:', product))
  .catch(error => console.error('Error:', error));
```

### Example 7: Update Product (Admin Only)

**cURL:**
```bash
curl -X PATCH http://localhost:5000/api/products/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated T-Shirt Name",
    "description": "Updated description",
    "isActive": false
  }'
```

**JavaScript:**
```javascript
const updateProduct = async (productId, updates) => {
  const token = localStorage.getItem('adminToken');
  
  const response = await fetch(`http://localhost:5000/api/products/${productId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  return await response.json();
};
```

---

## Order Management

### Example 8: Create Order

**cURL:**
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "variantId": 1,
        "quantity": 2
      },
      {
        "variantId": 3,
        "quantity": 1
      }
    ],
    "paymentMethod": "CASH_ON_DELIVERY"
  }'
```

**JavaScript:**
```javascript
const createOrder = async (orderData) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch('http://localhost:5000/api/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return await response.json();
};

// Usage - Shopping Cart Checkout
const cart = [
  { variantId: 1, quantity: 2 },
  { variantId: 3, quantity: 1 }
];

const order = {
  items: cart,
  paymentMethod: 'CASH_ON_DELIVERY'
};

createOrder(order)
  .then(order => {
    console.log('Order created:', order);
    // Clear cart, show success message
  })
  .catch(error => {
    console.error('Order failed:', error);
  });
```

**React Checkout Component:**
```javascript
import { useState } from 'react';

function Checkout({ cartItems }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch('http://localhost:5000/api/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: cartItems.map(item => ({
            variantId: item.variantId,
            quantity: item.quantity
          })),
          paymentMethod: 'CASH_ON_DELIVERY'
        })
      });
      
      if (!response.ok) {
        throw new Error('Order failed');
      }
      
      const order = await response.json();
      
      // Success - redirect to order confirmation
      window.location.href = `/orders/${order.id}`;
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <button onClick={handleCheckout} disabled={loading}>
        {loading ? 'Processing...' : 'Place Order'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

### Example 9: Get User Orders

**cURL:**
```bash
curl -X GET http://localhost:5000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**JavaScript:**
```javascript
const getMyOrders = async () => {
  const token = localStorage.getItem('token');
  
  const response = await fetch('http://localhost:5000/api/orders', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};
```

### Example 10: Update Order Status (Admin Only)

**cURL:**
```bash
curl -X PATCH http://localhost:5000/api/orders/1/status \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "SHIPPED"
  }'
```

**JavaScript:**
```javascript
const updateOrderStatus = async (orderId, status) => {
  const token = localStorage.getItem('adminToken');
  
  const response = await fetch(`http://localhost:5000/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status })
  });
  
  return await response.json();
};

// Usage
updateOrderStatus(1, 'SHIPPED')
  .then(order => console.log('Order updated:', order))
  .catch(error => console.error('Error:', error));
```

---

## User Management

### Example 11: Get User Profile

**cURL:**
```bash
curl -X GET http://localhost:5000/api/users/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**JavaScript:**
```javascript
const getProfile = async (userId) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`http://localhost:5000/api/users/${userId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};
```

### Example 12: Update User Profile

**cURL:**
```bash
curl -X PATCH http://localhost:5000/api/users/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com"
  }'
```

**JavaScript:**
```javascript
const updateProfile = async (userId, updates) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`http://localhost:5000/api/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  return await response.json();
};
```

---

## Address Management

### Example 13: Create Address

**cURL:**
```bash
curl -X POST http://localhost:5000/api/addresses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "address": "123 Main Street, Apt 4B",
    "city": "New York",
    "postalCode": "10001",
    "country": "USA",
    "isDefault": true
  }'
```

**JavaScript:**
```javascript
const createAddress = async (addressData) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch('http://localhost:5000/api/addresses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(addressData)
  });
  
  return await response.json();
};
```

### Example 14: Get All Addresses

**cURL:**
```bash
curl -X GET http://localhost:5000/api/addresses \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**JavaScript:**
```javascript
const getAddresses = async () => {
  const token = localStorage.getItem('token');
  
  const response = await fetch('http://localhost:5000/api/addresses', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};
```

### Example 15: Set Default Address

**cURL:**
```bash
curl -X PATCH http://localhost:5000/api/addresses/1/set-default \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**JavaScript:**
```javascript
const setDefaultAddress = async (addressId) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`http://localhost:5000/api/addresses/${addressId}/set-default`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};
```

---

## Category Management

### Example 16: Get All Categories

**cURL:**
```bash
curl -X GET http://localhost:5000/api/categories
```

**JavaScript:**
```javascript
const getCategories = async () => {
  const response = await fetch('http://localhost:5000/api/categories');
  return await response.json();
};
```

### Example 17: Create Category (Admin Only)

**cURL:**
```bash
curl -X POST http://localhost:5000/api/categories \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "T-Shirts",
    "slug": "t-shirts",
    "parentId": 1
  }'
```

**JavaScript:**
```javascript
const createCategory = async (categoryData) => {
  const token = localStorage.getItem('adminToken');
  
  const response = await fetch('http://localhost:5000/api/categories', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(categoryData)
  });
  
  return await response.json();
};
```

---

## Common Workflows

### Workflow 1: Complete Shopping Experience

```javascript
// 1. Browse products
const products = await fetch('http://localhost:5000/api/products')
  .then(res => res.json());

// 2. View product details
const product = await fetch(`http://localhost:5000/api/products/${productId}`)
  .then(res => res.json());

// 3. Add to cart (client-side)
const cart = [];
cart.push({
  variantId: product.variants[0].id,
  quantity: 1,
  price: product.variants[0].price
});

// 4. Sign up or login
const { access_token } = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
}).then(res => res.json());

// 5. Create/select address
const address = await fetch('http://localhost:5000/api/addresses', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(addressData)
}).then(res => res.json());

// 6. Place order
const order = await fetch('http://localhost:5000/api/orders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    items: cart.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity
    })),
    paymentMethod: 'CASH_ON_DELIVERY'
  })
}).then(res => res.json());

// 7. View order confirmation
console.log('Order placed:', order);
```

### Workflow 2: Admin Product Management

```javascript
// 1. Admin login
const { access_token } = await fetch('http://localhost:5000/api/auth/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@example.com', password: 'Admin123' })
}).then(res => res.json());

// 2. Create category
const category = await fetch('http://localhost:5000/api/categories', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'T-Shirts',
    slug: 't-shirts'
  })
}).then(res => res.json());

// 3. Create product
const product = await fetch('http://localhost:5000/api/products', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: 'Comfortable cotton t-shirt',
    categoryId: category.id,
    variants: [
      {
        sku: 'TS-001-S-BLK',
        price: 29.99,
        stock: 50,
        attributes: [
          { attributeName: 'Size', attributeValue: 'Small' },
          { attributeName: 'Color', attributeValue: 'Black' }
        ]
      }
    ]
  })
}).then(res => res.json());

// 4. View all orders
const orders = await fetch('http://localhost:5000/api/orders', {
  headers: { 'Authorization': `Bearer ${access_token}` }
}).then(res => res.json());

// 5. Update order status
await fetch(`http://localhost:5000/api/orders/${orders[0].id}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'SHIPPED' })
});
```

---

## Client Integration

### Axios Instance Setup

```javascript
import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Token expired, redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### React Context for Auth

```javascript
import { createContext, useState, useContext, useEffect } from 'react';
import api from './api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    
    setLoading(false);
  }, []);
  
  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    setUser(data.user);
    
    return data;
  };
  
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };
  
  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

---

## Error Handling

```javascript
const handleApiCall = async (apiFunction) => {
  try {
    const result = await apiFunction();
    return { success: true, data: result };
  } catch (error) {
    if (error.response) {
      // Server responded with error
      return {
        success: false,
        error: error.response.data.message || 'An error occurred'
      };
    } else if (error.request) {
      // Request made but no response
      return {
        success: false,
        error: 'No response from server'
      };
    } else {
      // Something else happened
      return {
        success: false,
        error: error.message
      };
    }
  }
};

// Usage
const result = await handleApiCall(() => 
  api.post('/orders', orderData)
);

if (result.success) {
  console.log('Order created:', result.data);
} else {
  console.error('Error:', result.error);
}
```

---

For more information, see:
- [API Documentation](./API_DOCUMENTATION.md)
- [Authentication Guide](./AUTHENTICATION.md)
- [Setup Guide](./SETUP_GUIDE.md)
