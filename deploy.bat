@echo off
setlocal

REM ==================================================
REM Buddy Node Backend - Cloud Run Deployment
REM ==================================================

set "PROJECT_ID=buddy-505709"
set "REGION=asia-south1"
set "REPOSITORY=buddy-backend-repo"
set "SERVICE=buddy-node-backend"
set "LOCAL_IMAGE=%SERVICE%:latest"
set "REMOTE_IMAGE=%REGION%-docker.pkg.dev/%PROJECT_ID%/%REPOSITORY%/%SERVICE%:latest"

echo.
echo ======================================
echo Validating required files...
echo ======================================

if not exist "package.json" (
    echo ERROR: package.json was not found.
    echo Run this script from the Node_Backend folder.
    exit /b 1
)

if not exist "Dockerfile" (
    echo ERROR: Dockerfile was not found.
    echo Run this script from the Node_Backend folder.
    exit /b 1
)

if not exist "cloud-run-env.yaml" (
    echo ERROR: cloud-run-env.yaml was not found.
    echo Run this script from the Node_Backend folder.
    exit /b 1
)

echo.
echo ======================================
echo Checking required commands...
echo ======================================

where gcloud >nul 2>&1
if errorlevel 1 (
    echo ERROR: gcloud command was not found.
    echo Install or initialize Google Cloud SDK.
    exit /b 1
)

where docker >nul 2>&1
if errorlevel 1 (
    echo ERROR: docker command was not found.
    echo Install and start Docker Desktop.
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm command was not found.
    echo Install Node.js and npm.
    exit /b 1
)

echo.
echo ======================================
echo Setting Google Cloud project...
echo ======================================

call gcloud config set project "%PROJECT_ID%"
if errorlevel 1 (
    echo ERROR: Could not select Google Cloud project.
    exit /b 1
)

echo.
echo Active account:
call gcloud config get-value account

echo Active project:
call gcloud config get-value project

echo.
echo ======================================
echo Enabling required Google Cloud APIs...
echo ======================================

call gcloud services enable ^
    run.googleapis.com ^
    artifactregistry.googleapis.com ^
    --project "%PROJECT_ID%"

if errorlevel 1 (
    echo ERROR: Could not enable the required APIs.
    exit /b 1
)

echo.
echo ======================================
echo Checking Artifact Registry...
echo ======================================

call gcloud artifacts repositories describe "%REPOSITORY%" ^
    --project "%PROJECT_ID%" ^
    --location "%REGION%" >nul 2>&1

if errorlevel 1 (
    echo Repository does not exist. Creating it...

    call gcloud artifacts repositories create "%REPOSITORY%" ^
        --project "%PROJECT_ID%" ^
        --repository-format docker ^
        --location "%REGION%" ^
        --description "Buddy backend Docker images"

    if errorlevel 1 (
        echo ERROR: Could not create Artifact Registry repository.
        exit /b 1
    )
) else (
    echo Artifact Registry repository already exists.
)

echo.
echo ======================================
echo Configuring Docker authentication...
echo ======================================

call gcloud auth configure-docker "%REGION%-docker.pkg.dev" --quiet
if errorlevel 1 (
    echo ERROR: Docker authentication configuration failed.
    exit /b 1
)

echo.
echo ======================================
echo Installing Node dependencies...
echo ======================================

call npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    exit /b 1
)

echo.
echo ======================================
echo Building TypeScript...
echo ======================================

call npm run build
if errorlevel 1 (
    echo ERROR: TypeScript build failed.
    exit /b 1
)

echo.
echo ======================================
echo Building Docker image...
echo Image: %LOCAL_IMAGE%
echo ======================================

docker build -t "%LOCAL_IMAGE%" .
if errorlevel 1 (
    echo ERROR: Docker image build failed.
    exit /b 1
)

echo.
echo ======================================
echo Tagging Docker image...
echo Remote image: %REMOTE_IMAGE%
echo ======================================

docker tag "%LOCAL_IMAGE%" "%REMOTE_IMAGE%"
if errorlevel 1 (
    echo ERROR: Docker image tagging failed.
    exit /b 1
)

echo.
echo ======================================
echo Pushing image to Artifact Registry...
echo ======================================

docker push "%REMOTE_IMAGE%"
if errorlevel 1 (
    echo ERROR: Docker image push failed.
    exit /b 1
)

echo.
echo ======================================
echo Deploying to Cloud Run...
echo Project: %PROJECT_ID%
echo Region:  %REGION%
echo Service: %SERVICE%
echo ======================================

call gcloud run deploy "%SERVICE%" ^
    --project "%PROJECT_ID%" ^
    --image "%REMOTE_IMAGE%" ^
    --region "%REGION%" ^
    --platform managed ^
    --env-vars-file "cloud-run-env.yaml" ^
    --min 0 ^
    --cpu-throttling ^
    --allow-unauthenticated ^
    --quiet

if errorlevel 1 (
    echo ERROR: Cloud Run deployment failed.
    exit /b 1
)

echo.
echo ======================================
echo Deployment completed successfully!
echo ======================================

echo.
echo Cloud Run URL:

call gcloud run services describe "%SERVICE%" ^
    --project "%PROJECT_ID%" ^
    --region "%REGION%" ^
    --format="value(status.url)"

echo.
echo Test the URL above using:
echo https://YOUR-CLOUD-RUN-URL/health
echo.

pause
endlocal