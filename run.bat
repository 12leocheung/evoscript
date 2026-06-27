@echo off
title EvoScript Simulator Runner
echo Starting the EvoScript local development environment...
echo.

:: Run the npm start command
call npm run start

:: Keep the window open if the server crashes or stops
pause