# Setting Up the Meld Documentation Site

This guide explains how to set up and run the Meld documentation site locally.

## Prerequisites

- Node.js (v16 or later)
- npm (v7 or later)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/meld.git
cd meld
```

2. Install the dependencies:

```bash
npm install
```

## Running the Site Locally

Start the development server:

```bash
npm run dev
```

This will:
- Build the site with Eleventy
- Convert the documentation Markdown files
- Start a local development server at http://localhost:8080

The site will automatically reload when you make changes to the source files.

## Building for Production

To build the site for production:

```bash
npm run build
```

This will:
- Build the site with Eleventy
- Convert the documentation Markdown files
- Output the static site to the `_site` directory

## Project Structure

- `src/` - Source files for pages
- `_layouts/` - Layout templates
- `_includes/` - Include files and partials
- `css/` - Stylesheets
- `js/` - JavaScript files
- `userdocs/` - Original documentation Markdown files

## Style Guide

- Font for logo: Tektur (800 weight)
- Font for headers: Cousine (700 weight)
- Font for body: Cousine (400 weight)
- Color scheme: Black and white with automatic light/dark mode support

## Working with Documentation

The original documentation is in the `userdocs/` directory. When the site is built, these files are:

1. Processed to add the proper frontmatter for Eleventy
2. Converted to HTML with the documentation layout
3. Output to the `_site/userdocs/` directory

If you need to update the documentation, edit the files in the `userdocs/` directory.