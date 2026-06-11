# Unofficial Mint Mobile MQTT Daemon

This is an unofficial service that fetches your Mint Mobile usage details and publishes them to an MQTT broker. Although it is designed with Home Assistant discovery in mind, it sends standard MQTT messages that any client can read.

To protect your account and avoid making repeated, unnecessary full login requests, the service includes a token refresh mechanism. It caches your session and automatically requests a new token using Mint's refresh API flow before the active token expires.

- Note: Multi-line and family plan tracking is implemented but has not been fully tested yet.

## Setup

First, copy the example environment file:

```
cp example.env .env
```

Open up your new .env file and fill in your credentials and MQTT broker details.

Install dependencies and run the daemon:

```
bun install
bun start
```

Note that the service will automatically create a `mint_data` directory at the project root to store cached session tokens, so ensure the running process has appropriate directory write permissions.

## Published Data

The daemon publishes the following status details for each line under your account:

- Plan Name (name of the active plan)
- Data Used (amount of high-speed data used in GB)
- Data Remaining (high-speed data left in GB)
- Data Total (total monthly high-speed data allowance in GB)
- Data Percent Used (percentage of monthly high-speed data used)
- Cycle End Date (timestamp when the current monthly cycle ends)
- Days Remaining (days left in the current monthly cycle)
- Plan Months Purchased (number of months in the purchased plan duration)
- Days Remaining for Plan (days remaining in the overall plan duration)
- Line Name (first name or nickname associated with the phone line)
- Last Updated (timestamp of the last successful data fetch)
