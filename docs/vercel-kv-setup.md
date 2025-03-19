# Setting Up Vercel KV for MůjDaňovýHlídač

This document explains how to set up Vercel KV for the MůjDaňovýHlídač project.

## Step 1: Create a Vercel KV Database

1. Go to your Vercel dashboard and select your project
2. Navigate to the "Storage" tab
3. Click on "Connect Store" and select "KV Database"
4. Choose a name for your database (e.g., "muj-danovy-hlidac-cache")
5. Select your preferred region (ideally close to your users, e.g., "Frankfurt (eu-central-1)")
6. Click "Create"

## Step 2: Connect the KV Database to Your Project

1. After creating the database, click on "Connect" next to your project name
2. Vercel will automatically add the required environment variables to your project:
   - `KV_URL`
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_REST_API_READ_ONLY_TOKEN`

## Step 3: Install the Vercel KV Package

Add the Vercel KV package to your project:

```bash
npm install @vercel/kv

