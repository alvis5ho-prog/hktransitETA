HK Transit ETA
香港公共交通到站 PWA／Expo Mobile App，提供香港巴士及綠色小巴路線搜尋、方向選擇、站點選擇及即時到站時間查詢。

Features
•	Search Hong Kong public transport routes.
•	Supports KMB, Citybus and Green Minibus routes.
•	Supports route examples such as 91, 98D, 小巴 103 and 103M.
•	Shows route operator, origin and destination.
•	Select a travelling direction and boarding stop.
•	Displays up to three upcoming arrival times.
•	Highlights the earliest arrival time.
•	Refreshes ETA data automatically every 30 seconds.
•	Remembers the selected routes, operator, direction, stop and search text on the same device and browser.
•	Responsive portrait and landscape layouts.
•	Can be deployed as a Progressive Web App (PWA).

Data Sources
This project retrieves public transport information from Hong Kong official/open-data services:

•	KMB ETA API
•	Citybus ETA API
•	Hong Kong Green Minibus ETA API

Arrival times are live data supplied by the relevant transport data services. Availability and accuracy depend on the upstream APIs and network connection.

Technology Stack
•	Expo SDK 54
•	React Native
•	React Native Web
•	Expo Router
•	TypeScript
•	NativeWind
•	AsyncStorage for local settings
•	Vitest for tests
•	Official Hong Kong transport APIs

Requirements
Install the following before running the project:

•	Node.js 20 or a compatible current LTS release
•	pnpm 9 or later
•	Expo CLI through the project dependencies

Installation
Clone the repository and install dependencies:

git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
pnpm install

Replace YOUR_USERNAME/YOUR_REPOSITORY with the actual GitHub repository path.

Run in Development
Start the Expo development server:

pnpm dev:metro

To run the complete project development command, including the server process:

pnpm dev

For a web/PWA preview, open the URL shown by Expo in a browser.

Quality Checks
Run TypeScript validation, linting and tests:

pnpm check
pnpm lint
pnpm test

The tests cover route-code normalization, operator detection, Hong Kong time formatting and local settings storage.

Build the Web/PWA Version
Export the Expo project as a web build:

npx expo export --platform web

The production files will be generated in:

dist/

The dist folder can be deployed to a static hosting service such as Cloudflare Pages, Netlify or another HTTPS-enabled host.

PWA Installation on iPhone
1	Open the deployed HTTPS URL in Safari.
2	Tap the Share button.
3	Select Add to Home Screen.
4	Confirm the app name and icon.
5	Open the app from the iPhone Home Screen.

Local route settings are stored separately for each device, browser and domain. Clearing browser data or changing browsers may remove or reset the saved settings.

Build an iOS App
This project is based on Expo and React Native, so the same project can also be built as a native iOS application.

After configuring an Apple Developer account and EAS Build:

npx eas-cli build:configure
eas build --platform ios --profile production

The resulting iOS build can be submitted to App Store Connect for TestFlight testing and App Store review.

Project Structure
app/                 Expo Router screens
components/          Reusable React Native components
lib/transit-api.ts   Transport API access and data transformation
lib/transit-storage.ts
                     Local route and stop settings storage
public/              PWA manifest and web assets
server/              Project server files
shared/              Shared types and utilities
tests/               Unit tests
assets/              App icons and static assets

Privacy Notes
The current route preferences are stored locally on the user's device and browser. The project does not require an account for route lookup. If cloud accounts, saved conversations, analytics or AI features are added in the future, update the privacy policy and data-handling design before deployment.

License
Add the project's chosen license here before public distribution. If no open-source license is selected, all rights remain with the copyright owner by default.
