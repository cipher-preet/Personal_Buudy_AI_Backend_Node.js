@echo off

echo ======================================
echo Building TypeScript...
echo ======================================
call npm run build
if errorlevel 1 exit /b 1

echo ======================================
echo Building Docker Image...
echo ======================================
docker build -t buddy-node-backend:latest .
if errorlevel 1 exit /b 1

echo ======================================
echo Tagging Image...
echo ======================================
docker tag buddy-node-backend:latest asia-south1-docker.pkg.dev/python-microservice-hub/buddy-backend-repo/buddy-node-backend:latest

echo ======================================
echo Pushing Image...
echo ======================================
docker push asia-south1-docker.pkg.dev/python-microservice-hub/buddy-backend-repo/buddy-node-backend:latest
if errorlevel 1 exit /b 1

echo ======================================
echo Deploying to Cloud Run...
echo ======================================
gcloud run deploy buddy-node-backend ^
 --image asia-south1-docker.pkg.dev/python-microservice-hub/buddy-backend-repo/buddy-node-backend:latest ^
 --region asia-south1 ^
 --quiet

echo ======================================
echo Deployment Complete!
echo ======================================
pause