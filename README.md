# Notion Connector Extension (Task Capture MVP)

Current version supports:
- task-first popup UI with one main screen and a Settings drawer,
- automatic dark mode via system preference,
- connection test with `users/me`,
- task creation in Notion database using `POST /v1/pages`,
- PARA instance loading from a second database into the task dropdown (stored/sent as relation page ID),
- wider tasks table view with `Today`/`All` filter.

## Files
- `manifest.json`: MV3 extension manifest.
- `popup.html`, `popup.css`, `popup.js`: extension UI logic.
- `background.js`: background service worker message handler.
- `notionClient.js`: Notion API requests and mapping.
- `storage.js`: token/database storage helpers.
- `PRD.md`: product requirements.
- `IMPLEMENTATION_PROMPT.md`: implementation brief for v0.2.

## 1. Prepare Notion Integration
- In Notion, create an internal integration.
- Copy the integration token (`secret_...`).
- Copy the target database ID.
- Share that database with the integration.

## 2. Load Extension in Edge
- Open Edge and go to: `edge://extensions`.
- Enable Developer mode.
- Click "Load unpacked".
- Select this folder: `PARA_WSL/1_Projects/Notion_Browser_Extention`.

## 3. Configure Extension
- Open extension popup.
- Click `Settings` in the header.
- Paste token, Task Database ID, and PARA Database ID.
- Click "Save settings".
- Click "Test connection".

## 4. Create Task
- Enter task title in main popup.
- Optional: choose `Section Day` dropdown.
- Optional: choose `PARA` dropdown (loaded from PARA database).
- Optional: set `Do on` date.
- Click "Save Task".

## 5. View Tasks
- The main screen shows a wider tasks table.
- Data source: all tasks from your task database.
- Use filter:
  - `Today` to show rows where `Do on` equals today's date.
  - `All` to show every fetched task.
- Click `Refresh` to reload tasks from Notion.

Expected:
- Success message includes created Notion task ID and URL.

Note:
- Feedback is shown inline and as a compact toast instead of a separate result block.

## 6. Common Issues
- Unauthorized token:
  - Ensure token is correct and not expired/revoked.
- Database not found:
  - Verify both database IDs and ensure integration has access to both databases.
- PARA dropdown not populated:
  - Verify PARA database ID in Settings and confirm rows have title values.
- Schema mismatch (400):
  - Ensure database has default properties: `Name` (title), optional `Do on` (date), optional `Sekcja dnia` (select), optional `PARA` (relation).
- API errors:
  - Retry after a moment if rate-limited.
