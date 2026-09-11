# SME Phishing Simulation Platform — API Documentation

This document specifies the endpoints, request/response structures, and authentication requirements for the foundational backend modules maintained on branch `omJalela`.

---

## Base URL & Authentication

* **Base URL:** `http://127.0.0.1:3000/api` or localhost:3000 
* **Public Endpoints:** No authentication required (used by targets interacting with simulation links).
* **Protected Endpoints:** Requires a valid JSON Web Token (JWT) passed in the `Authorization` header:
  ```http
  Authorization: Bearer <jwt_token> (ask om jalela for the tokens and agar koi aur issues aaye toh dont think twice before texting)