Om Jalela : Just completed authentication with passport.js and i also hid the .env file with .gitignore (i shouldve done that earlier). If you have any doubts regarding the table naming scheme or the columns in the database you can text me ill fill you in on the MySQL table list. this is my first time working with passport.js so things might be a little bit lacklsuter but if anyone wants to check out if the authentication works or even if the database is connecting aache se you can use the following commands in the terminal. 







1. to start the server -- (node server.js) {either type the url localhost:3000 in the browser or click on the link on the terminal and to check api status use the following link : http://localhost:3000/api/health}

2. to check the authentication {abhi frontend nahi available hai merepaas toh thoda temporarily ye commands se check karo USING A SECOND TERMINAL}
a) FOR ADMIN REGISTRATION:
  curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin User","email":"admin@example.com","password":"Password123!"}'
b) FOR LOGIN AND JWT GENERATION
  curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Password123!"}'
c) TO CHECK IF PASSPORT.JS IS USING A PROTECTED ROUTE AND IS GRANTING ACCESS
  curl -X GET http://localhost:3000/api/auth/protected \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sZSI6IkFkbWluIiwiaWF0IjoxNzg4NjI5MzI2LCJleHAiOjE3ODg2NTgxMjZ9.EZwFyMFRchmOj3NQc4fdPyvWs_iHouqWPsovoggwLXY"

  Om Jalela: TUTORIAL ON HOW TO USE SEE/DELETE EMPLOYEES RN because i didnt add the ui for checking out which employees are in the database

  use sql for this 

  command to fetch employees:      mysql -h 127.0.0.1 -u app_user -p -e "USE phishing_simulation; SELECT * FROM Employees;"

  command to delete employees (by email):     mysql -h 127.0.0.1 -u app_user -p -e "USE phishing_simulation; DELETE FROM Employees WHERE email = 'PUT THE EMAIL HERE';"






almost pura ho chuka hai mera part and ive added the contract details(handoff dteails) in documentation/API_DOCS.md
