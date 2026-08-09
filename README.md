# CKJC Application System

An online application submission system for the Judicial Committee of the Chien-Kuo High School Student Council (臺北市立建國高級中學班聯會評議委員會), built on Google Apps Script.

https://github.com/user-attachments/assets/b05ecf99-9702-4799-bd00-78e61ce07a44

## Overview

This system provides a web-based form for students and agencies to submit three types of applications to the Judicial Committee:

- **Resolution (決議聲請)** — petition the Judicial Committee to establish a uniform legal interpretation or handle major disputed cases
- **Charter Lawsuit (憲章訴訟)** — petition for normative, act-based, or judgement-based charter review
- **General Lawsuit (一般訴訟)** — petition for administrative, duty, compensation, declaratory, election-nullification, or other lawsuits

Upon submission, the system automatically records the case to a Google Sheets spreadsheet and sends a confirmation email to the applicant (CC'd to the committee).

## Platform & Architecture

The project is deployed as a **Google Apps Script Web App**. It uses the following Google services:

| Service | Purpose |
| --- | --- |
| `HtmlService` | Serves the front-end web interface |
| `SpreadsheetApp` | Records incoming applications |
| `GmailApp` | Sends notification emails to applicants and the committee |
| `DriveApp` | Accepts and stores uploaded application documents |
| `PropertiesService` | Stores configuration (email addresses, spreadsheet ID, dev flag, case counters) |

The front-end is composed of HTML templates (`index.html`, `script.html`, `stylesheet.html`) included via `HtmlService.createTemplateFromFile`. Business logic is split across:

- `web.js` — entry point (`doGet`) and form submission handler (`submitApplication`)
- `utils.js` — case ID generation, spreadsheet insertion, email dispatch, file/link validation, and Drive helpers
- `classes.js` — data class definitions (e.g. `Applicant`)

## File Submission

Applicants may submit their application document either as:

- A **direct file upload** (PDF, DOC, DOCX, ODT, TXT; max 10 MB), or
- A **Google Drive / Google Docs shared link** (must be set to "Anyone with the link can view")

The system validates file type, MIME type consistency, dangerous filename patterns, and file size before accepting uploads.

## Configuration

The following script properties must be set before deployment:

| Property | Description |
| --- | --- |
| `JC_EMAIL` | Committee's email address (CC recipient) |
| `GOOGLE_GROUP_EMAIL` | Committee's Google Group address (BCC recipient) |
| `STORAGE_SPREADSHEET_ID` | Google Sheets spreadsheet ID for case records |
| `STORAGE_FOLDER_ID` | Google Drive folder ID for storing uploaded application documents |
| `IS_DEV` | Set to `"true"` to enable dev mode (displays an development notice instead of a do-not-spam notice) |

Counter properties (`RESOLUTION_APPL_COUNTER`, `CHARTER_APPL_COUNTER`, `LAWSUIT_APPL_COUNTER`, `COUNTER_REIGN`) are managed automatically at runtime.

## Development & Deployment

This project is managed with [clasp](https://github.com/google/clasp), the Google Apps Script CLI tool.

```bash
# Push local changes to Google Apps Script
clasp push

# Open the project in the Apps Script editor
clasp open
```

Deploy as a web app from the Apps Script editor or via `clasp deploy`.

## Branches

- `main` — production branch
- A [separate dev deployment](https://script.google.com/macros/s/AKfycbzYxZYG2xvMxWb3ZlIFS9RmLvAFN_-yRGibR450BRXQwSUGBbPx6-F_wbT1HZMDsRr4/exec) is available for testing without sending emails to the committee address

## AI Usage Declaration

The initial prototype was developed with the assistance of Perplexity, based on a defined idea of functionality, structure, procedure, and platform.  
Throughout development, Perplexity is consulted for information gathering and bug resolution that is far beyond the author's immediate knowledge.  
GitHub Copilot is used for code review and generating potential fixes, though inline ghost text suggestions remain disabled for the most part.
The function calling Google Translate was made by GitHub Copilot, but debugged by the author.  

## Licence

This project is licenced under the CC BY 4.0. See [LICENCE](./LICENCE) for details.
