@echo off

if not exist cloud-run-env.yaml (
 echo cloud-run-env.yaml not found. Run this script from the Node_Backend folder.
 exit /b 1
)

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
 --env-vars-file cloud-run-env.yaml ^
 --quiet
if errorlevel 1 exit /b 1

echo ======================================
echo Deployment Complete!
echo ======================================
pause
