# Jatri Ovijog Backend (Spring Boot + Supabase)

This module provides a minimal backend API for your Jatri Ovijog application. It exposes REST
endpoints for user authentication, complaint submission and retrieval, and SOS
emergency reporting. Under the hood it forwards all CRUD operations to your
Supabase project's auto‑generated PostgREST API. By switching out the dummy
arrays in your JavaScript files for calls to these endpoints you turn your
static prototype into a fully functional application backed by a PostgreSQL
database.

## Prerequisites

* **Java 21** or later
* **Maven 3.9** or later
* A Supabase project. You will need:
  * The REST API base URL (e.g. `https://your-project-ref.supabase.co`)
  * The anon API key (for public, RLS–restricted access)
  * The JWT secret (from your Supabase dashboard) so the backend can verify
    tokens issued by Supabase Auth or generate its own tokens.
* (Optional) The service role key if you wish to perform privileged operations.

## Running the backend

1. Clone or extract this repository.
2. In `src/main/resources/application.properties` fill in your Supabase
   configuration:

   ```properties
   supabase.url=https://your-project-ref.supabase.co
   supabase.apikey=your-anon-key
   jwt.secret=your-supabase-jwt-secret
   # spring.datasource.url=jdbc:postgresql://db.your-project-ref.supabase.co:6543/postgres
   # spring.datasource.username=postgres
   # spring.datasource.password=your-db-password
   ```
3. Run migrations (Flyway will execute the SQL in `db/migration` on application
   startup if a datasource is configured). When using Supabase's REST API
   instead of direct JDBC, create the tables manually in the Supabase SQL
   editor using `V1__initial_schema.sql`.
4. Build and run:

   ```bash
   mvn clean package
   java -jar target/jatri-ovijog-0.1.0.jar
   ```
5. The API will be available at `http://localhost:8080/api/…`.

## Endpoints

All endpoints return JSON. See `SupabaseService` and the controllers for
details.

| Method | Path                 | Description                       |
|-------|----------------------|-----------------------------------|
| POST  | `/api/auth/signup`   | Create a new user                 |
| POST  | `/api/auth/login`    | Authenticate and return a JWT     |
| GET   | `/api/complaints`    | Retrieve all complaints           |
| POST  | `/api/complaints`    | Submit a complaint                |
| GET   | `/api/emergencies`   | Retrieve all emergency reports    |
| POST  | `/api/emergencies`   | Submit a new emergency report     |

### JWT handling

This sample exposes authentication endpoints but does not yet secure the API.
In a production system you should implement a `OncePerRequestFilter` that
validates the `Authorization: Bearer <token>` header on each request. Use
`JwtUtil.validateToken()` to decode and verify the signature. Then populate
Spring Security's `SecurityContext` with the user details.

### SQL Schema

Flyway migration `V1__initial_schema.sql` contains SQL statements to create
three tables: `users`, `complaints`, and `emergency_reports`. Run these in
Supabase's SQL editor or allow Flyway to execute them if you configure a
JDBC datasource.

## Next steps

* Integrate Supabase Auth directly instead of manually hashing passwords.
* Implement proper JWT validation and role based access control.
* Upload SOS audio clips to Supabase Storage and store the public URL in the
  `emergency_reports` table.
* Harden error handling and validation throughout the controllers.# Jantri-Ovijog
