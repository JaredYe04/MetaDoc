# Workspace Management

## Overview

Workspace management allows you to open and manage folders within MetaDoc, providing file explorer-like functionality. Through the workspace, you can conveniently browse, open, and manage project files.

## Introduction to Workspace

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

### What is a Workspace

A workspace is a folder opened within MetaDoc, enabling you to:

```mermaid
graph LR
    A[Open Folder] --> B[Workspace Panel]
    B --> C[Browse/Open Files]
    C --> D[Manage Files]
    D --> E[Rename/Delete/Create New]
    style A fill:#f3f4f6,stroke:#374151
    style B fill:#f3f4f6,stroke:#374151
    style C fill:#f3f4f6,stroke:#374151
    style D fill:#f3f4f6,stroke:#374151
    style E fill:#f3f4f6,stroke:#374151
```

- **Browse Files**: View files and subfolders within the folder.
- **Open Files**: Open files directly within MetaDoc.
- **Manage Files**: Perform operations like renaming and deleting files.
- **Project Organization**: Organize related files within a single directory.

### Use Cases

The workspace is suitable for the following scenarios:

- **Project Management**: Manage all documents within a project.
- **File Browsing**: Quickly browse and open files.
- **Document Organization**: Group related documents together.
- **Batch Operations**: Perform operations on multiple files.

## Opening a Workspace

<ViewMenuItemsDemo mode="demo" :items='["workspace", "editor"]' />

### Opening a Directory

1. Click the "Workspace" icon in the left-side menu.
2. If no directory is currently open, a directory selection dialog will appear.
3. Select the folder you wish to open.
4. The directory will be displayed in the sidebar.

You can access the workspace view via the sidebar:

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

<ViewMenuItemsDemo mode="demo" :items='["editor", "outline", "home"]' />

### Switching Directories

To switch to a different directory:

1. Click the menu button on the workspace title bar.
2. Select "Open Folder".
3. Choose the new folder.
4. The new directory will replace the current one.

### Closing a Directory

You can close the currently open workspace:

1. Click the menu button on the workspace title bar.
2. Select "Close Workspace".
3. The workspace panel will be hidden.

## File Browsing

<ViewMenuItemsDemo mode="demo" :items='["workspace", "editor", "outline"]' />

### Directory Tree Structure

The workspace displays content in a tree structure:

- **Folders**: Displayed with a folder icon, can be expanded/collapsed.
- **Files**: Displayed with a file icon, showing the filename.
- **Hierarchical Structure**: Supports nested folders at multiple levels.

### Expanding and Collapsing

- **Expand Folder**: Click the folder icon or name.
- **Collapse Folder**: Click an already expanded folder again.
- **Expand All**: Use the right-click context menu to select "Expand All".
- **Collapse All**: Use the right-click context menu to select "Collapse All".

### File Type Recognition

The workspace recognizes file types:

- **Markdown Files** (.md): Display a Markdown icon.
- **LaTeX Files** (.tex): Display a LaTeX icon.
- **Image Files** (.png, .jpg, etc.): Display an image icon.
- **Other Files**: Display a generic file icon.

## File Operations

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

<MenuItemsDemo mode="demo" :items='[{"id": "file", "items": ["new", "open"]}]' />

### Opening Files

There are several ways to open a file:

- **Double-click File**: Double-click the file icon or name.
- **Right-click Menu**: Right-click the file and select "Open".
- **Drag and Drop**: Drag the file into the editor area.

Once opened, the file will open in a new tab.

### Previewing Files

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

You can preview files without fully opening them:

- **Right-click Menu**: Right-click the file and select "Preview".
- **Preview Mode**: The file opens in a preview tab.
- **Switch to Edit**: You can switch to edit mode from preview mode.

### Renaming Files

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

1. Right-click the file you want to rename.
2. Select "Rename".
3. Enter the new filename.
4. Press Enter to confirm or Esc to cancel.

**Notes**:

- Renaming changes the filename in the file system.
- If the file is being edited, save it first.
- The file path changes after renaming.

### Deleting Files

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

1. Right-click the file you want to delete.
2. Select "Delete".
3. Confirm the deletion.

**Notes**:

- The delete operation cannot be undone.
- If the file is being edited, close it first.
- Deleting a folder deletes all files within it.

### Creating New Files

1. Right-click a folder or empty area.
2. Select "New File".
3. Enter the filename (including the extension).
4. Press Enter to confirm.

The new file will open immediately in the editor.

### Creating New Folders

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

1. Right-click a folder or empty area.
2. Select "New Folder".
3. Enter the folder name.
4. Press Enter to confirm.

## Advanced File Operations

<ViewMenuItemsDemo mode="demo" :items='["workspace", "editor"]' />

### Copying Files

1. Right-click the file you want to copy.
2. Select "Copy".
3. Right-click the target location.
4. Select "Paste".

### Cutting Files

1. Right-click the file you want to cut.
2. Select "Cut".
3. Right-click the target location.
4. Select "Paste".

### Pasting Files

1. After copying or cutting a file.
2. Right-click the target location.
3. Select "Paste".

**Notes**:

- Pasting into a folder creates the file within that folder.
- If a file with the same name exists at the target, you will be prompted to overwrite or rename.

### Batch Operations

You can select multiple files simultaneously for operations:

- **Multiple Selection**: Hold Ctrl and click multiple files.
- **Select All**: Use Ctrl+A to select all files.
- **Batch Operations**: Perform copy, delete, etc., on selected files.

## File Search

<ViewMenuItemsDemo mode="demo" :items='["workspace"]' />

### Search Functionality

The workspace supports file search:

1. Use the search box in the workspace panel.
2. Enter a filename or keyword.
3. Search results will be highlighted.

### Search Scope

Search is performed within the following scope:

- **Current Directory**: The currently open workspace.
- **Subdirectories**: Includes all subfolders.
- **Filenames**: Searches filenames, not file content.

## Directory Monitoring

<ViewMenuItemsDemo mode="demo" :items='["workspace", "outline"]' />

### Auto-refresh

The workspace automatically monitors filesystem changes:

- **File Creation**: Newly created files appear automatically.
- **File Deletion**: Deleted files are automatically removed.
- **File Renaming**: Renamed files are automatically updated.
- **File Modification**: Modified files show an update indicator.

### Manual Refresh

To manually refresh the directory:

1. Right-click a folder or empty area.
2. Select "Refresh".
3. The directory will reload.

## File Paths

### Displaying Paths

The workspace displays the full path of files:

- **Hover Tooltip**: Hover the mouse over a file to see its full path.
- **Path Bar**: Some views may display a path bar.
- **Right-click Menu**: The context menu may show path information.

### Path Operations

- **Copy Path**: Copy the full path of a file.
- **Open Location**: Open the file's location in the system file manager.
- **Path Navigation**: Quickly locate files via their path.

## Best Practices

1. **Project Organization**: Organize related files within a single workspace.
2. **File Naming**: Use clear naming conventions.
3. **Regular Backups**: Regularly back up important files.
4. **File Cleanup**: Periodically clean up unnecessary files.
5. **Directory Structure**: Maintain a clear directory structure.

## Notes

1. **File Permissions**: Ensure you have read/write permissions for files.
2. **File Locking**: Some files may be locked by other programs.
3. **Path Length**: Be mindful of file path length limits.
4. **Special Characters**: Avoid special characters in filenames.
5. **File Size**: Opening large files may take time.

## Related Documentation

- [[core.file-operations|File Operations]]
- [[core.multi-tab|Multi-tab Management]]
- [[core.multi-window|Multi-window Management]]
