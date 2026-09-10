"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };

  // src/widget/markdown.ts
  function cleanInlineText(markdown) {
    return markdown.replace(/(`{1,3}|\*\*|__|~~|\*|_)(.*?)\1/g, "$2").replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, "$1");
  }
  function cleanLinkHref(markdown) {
    const unwrapped = markdown.startsWith("<") && markdown.endsWith(">") ? markdown.slice(1, -1) : markdown;
    const cleaned = unwrapped.replace(/\\(.)/g, "$1");
    return cleaned.replace(
      /^(https:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\/[A-Za-z0-9_-]+)(\?node-id=)/i,
      "$1/Figma$2"
    );
  }
  function parseStandaloneImage(markdown) {
    var _a, _b;
    const match = /^\s*!\[([^\]]*)\]\(\s*((?:<[^>\n]+>)|(?:\\.|[^()\s]|\([^()\s]*\))+)(?:\s+(['"])(.*?)\3)?\s*\)\s*$/.exec(markdown);
    if (!(match == null ? void 0 : match[2])) return null;
    return {
      alt: cleanInlineText((_a = match[1]) != null ? _a : ""),
      href: cleanLinkHref(match[2]),
      title: cleanInlineText((_b = match[4]) != null ? _b : "")
    };
  }
  function parseInline(markdown) {
    var _a, _b;
    if (isVisualBlank(markdown)) return [{ text: " " }];
    const segments = [];
    const linkPattern = /(!?)\[([^\]]*)\]\(((?:<[^>\n]+>)|(?:\\.|[^()\s]|\([^()\s]*\))+)(?:\s+['"][^'"]*['"])?\)/g;
    let cursor = 0;
    const append = (text, href) => {
      const cleaned = cleanInlineText(text);
      if (!cleaned) return;
      const previous = segments[segments.length - 1];
      if (previous && previous.href === href) previous.text += cleaned;
      else segments.push(href ? { text: cleaned, href } : { text: cleaned });
    };
    for (const match of markdown.matchAll(linkPattern)) {
      const offset = (_a = match.index) != null ? _a : 0;
      append(markdown.slice(cursor, offset));
      append(match[2] || "", match[1] ? void 0 : cleanLinkHref((_b = match[3]) != null ? _b : ""));
      cursor = offset + match[0].length;
    }
    append(markdown.slice(cursor));
    if (segments.length === 0) return [{ text: " " }];
    segments[0].text = segments[0].text.replace(/^\s+/, "");
    segments[segments.length - 1].text = segments[segments.length - 1].text.replace(/\s+$/, "");
    return segments.filter((segment) => segment.text.length > 0);
  }
  function isVisualBlank(line) {
    const value = line.trim();
    return /^<br\s*\/?\s*>$/i.test(value) || /^#{1,6}$/.test(value);
  }
  function splitTableRow(line) {
    const source = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells = [];
    let current = "";
    let escaped = false;
    for (const character of source) {
      if (escaped) {
        current += character;
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
        current += character;
      } else if (character === "|") {
        cells.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }
    cells.push(current.trim());
    return cells;
  }
  function parseTableDelimiter(line) {
    const cells = splitTableRow(line);
    if (cells.length === 0 || cells.some((cell) => !/^:?-{3,}:?$/.test(cell))) return null;
    return cells.map((cell) => {
      if (cell.startsWith(":") && cell.endsWith(":")) return "center";
      if (cell.endsWith(":")) return "right";
      return "left";
    });
  }
  function startsTable(lines, index) {
    var _a, _b;
    const current = (_a = lines[index]) != null ? _a : "";
    const next = (_b = lines[index + 1]) != null ? _b : "";
    return current.includes("|") && parseTableDelimiter(next) !== null;
  }
  function isBlockStart(lines, index) {
    var _a;
    const line = (_a = lines[index]) != null ? _a : "";
    return /^\s*$/.test(line) || isVisualBlank(line) || startsTable(lines, index) || /^#{1,6}\s+/.test(line) || /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || /^\s*>\s?/.test(line) || /^\s*```/.test(line) || /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line) || parseStandaloneImage(line) !== null;
  }
  function parseWidgetMarkdown(markdown) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = (_a = lines[index]) != null ? _a : "";
      if (!line.trim()) continue;
      if (isVisualBlank(line)) {
        blocks.push({ type: "spacer" });
        continue;
      }
      if (/^\s*```/.test(line)) {
        const code = [];
        index += 1;
        while (index < lines.length && !/^\s*```/.test((_b = lines[index]) != null ? _b : "")) {
          code.push((_c = lines[index]) != null ? _c : "");
          index += 1;
        }
        blocks.push({ type: "code", text: code.join("\n") || " " });
        continue;
      }
      const image = parseStandaloneImage(line);
      if (image) {
        const ratioOrAlt = image.alt;
        const ratio = Number(ratioOrAlt);
        const assetId = image.href.startsWith("figma-asset://") ? image.href.slice("figma-asset://".length) : void 0;
        const embeddedSrc = image.href.startsWith("data:image/") ? image.href : void 0;
        blocks.push({
          type: "image",
          alt: image.title || (Number.isFinite(ratio) ? "\u56FE\u7247" : ratioOrAlt || "\u56FE\u7247"),
          assetId,
          src: embeddedSrc,
          manualWidth: Number.isFinite(ratio) && (ratio < 0 || ratio > 10) ? Math.abs(ratio) : void 0
        });
        continue;
      }
      if (startsTable(lines, index)) {
        const headerCells = splitTableRow(line);
        const align = (_e = parseTableDelimiter((_d = lines[index + 1]) != null ? _d : "")) != null ? _e : [];
        const rows = [];
        index += 2;
        while (index < lines.length) {
          const rowLine = (_f = lines[index]) != null ? _f : "";
          if (!rowLine.trim() || !rowLine.includes("|")) break;
          rows.push(splitTableRow(rowLine).map(parseInline));
          index += 1;
        }
        index -= 1;
        blocks.push({ type: "table", header: headerCells.map(parseInline), rows, align });
        continue;
      }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if ((heading == null ? void 0 : heading[1]) && heading[2]) {
        blocks.push({ type: "heading", level: heading[1].length, inline: parseInline(heading[2]) });
        continue;
      }
      if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
        blocks.push({ type: "divider" });
        continue;
      }
      const bullet = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(line);
      if (bullet == null ? void 0 : bullet[1]) {
        blocks.push({ type: "bullet", inline: parseInline(bullet[1]) });
        continue;
      }
      const ordered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
      if ((ordered == null ? void 0 : ordered[1]) && ordered[2]) {
        blocks.push({ type: "ordered", order: Number(ordered[1]), inline: parseInline(ordered[2]) });
        continue;
      }
      const quote = /^\s*>\s?(.*)$/.exec(line);
      if (quote) {
        const quoteLines = [(_g = quote[1]) != null ? _g : ""];
        while (index + 1 < lines.length) {
          const nextQuote = /^\s*>\s?(.*)$/.exec((_h = lines[index + 1]) != null ? _h : "");
          if (!nextQuote) break;
          index += 1;
          quoteLines.push((_i = nextQuote[1]) != null ? _i : "");
        }
        const visibleQuoteLines = quoteLines.filter((quoteLine) => quoteLine.trim().length > 0);
        blocks.push({ type: "quote", inline: parseInline(visibleQuoteLines.join("\n") || " ") });
        continue;
      }
      const paragraph = [line.trim()];
      while (index + 1 < lines.length && !isBlockStart(lines, index + 1)) {
        index += 1;
        paragraph.push(((_j = lines[index]) != null ? _j : "").trim());
      }
      blocks.push({ type: "paragraph", inline: parseInline(paragraph.join(" ")) });
    }
    return blocks;
  }

  // src/widget/code.ts
  var { widget } = figma;
  var { h, AutoLayout, Frame, Image, Rectangle, Span, Text, useSyncedState, useWidgetNodeId } = widget;
  var CONTENT_WIDTH = 720;
  var CANVAS_NODE_BUDGET = 360;
  var WIDGET_SCHEMA_VERSION = 3;
  var DOCUMENT_FILE_KEY_DATA = "md-block-figma-file-key-v1";
  var suppressEditorOpenUntil = 0;
  function findSelectedSceneNode(currentWidgetId) {
    var _a;
    return (_a = figma.currentPage.selection.find((node) => node.id !== currentWidgetId && isSceneNode(node))) != null ? _a : null;
  }
  function extractFigmaFileKey(input) {
    var _a;
    const normalized = input.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    const match = normalized.match(
      /(?:https?:\/\/)?(?:www\.)?figma\.com\/(?:design|file|proto|board)\/([A-Za-z0-9_-]+)/i
    );
    return (_a = match == null ? void 0 : match[1]) != null ? _a : null;
  }
  function createNodeUrl(node, fileKey) {
    const slug = encodeURIComponent(figma.root.name || "Figma").replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
    const nodeId = encodeURIComponent(node.id.replace(":", "-"));
    return `https://www.figma.com/design/${encodeURIComponent(fileKey)}/${slug}?node-id=${nodeId}`;
  }
  function containingPage(node) {
    let current = node;
    while (current && current.type !== "PAGE") current = current.parent;
    return (current == null ? void 0 : current.type) === "PAGE" ? current : null;
  }
  function isSceneNode(node) {
    return node.type !== "DOCUMENT" && node.type !== "PAGE";
  }
  function figmaNodeIdFromHref(href) {
    if (!href || !/^https:\/\/(?:www\.)?figma\.com\//i.test(href)) return null;
    const match = href.match(/[?&]node-id=([^&#]+)/i);
    if (!(match == null ? void 0 : match[1])) return null;
    try {
      const nodeId = decodeURIComponent(match[1]);
      return nodeId.includes(":") ? nodeId : nodeId.replace("-", ":");
    } catch (e) {
      return null;
    }
  }
  async function navigateToFigmaNode(nodeId) {
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || !isSceneNode(node)) {
        figma.notify("\u5BF9\u5E94\u753B\u677F\u6216\u56FE\u5C42\u5DF2\u4E0D\u5B58\u5728\u3002", { error: true });
        return;
      }
      const page = containingPage(node);
      if (page && page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      figma.notify(`\u5DF2\u5B9A\u4F4D\u5230\u300C${node.name}\u300D`);
    } catch (e) {
      figma.notify("\u65E0\u6CD5\u5B9A\u4F4D\u5BF9\u5E94\u753B\u677F\u6216\u56FE\u5C42\u3002", { error: true });
    }
  }
  async function handleFigmaNodeClick(nodeId) {
    suppressEditorOpenUntil = Date.now() + 500;
    try {
      figma.ui.close();
    } catch (e) {
    }
    await navigateToFigmaNode(nodeId);
  }
  function imageSize(sourceWidth, sourceHeight, manualWidth) {
    const safeSourceWidth = Math.max(sourceWidth, 1);
    const safeSourceHeight = Math.max(sourceHeight, 1);
    const width = manualWidth ? Math.max(120, Math.min(1600, Math.round(manualWidth))) : CONTENT_WIDTH;
    return { width, height: Math.max(80, Math.round(safeSourceHeight / safeSourceWidth * width)) };
  }
  function embeddedImageDimensions(src) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s;
    const match = /^data:image\/(png|jpe?g|gif);base64,([A-Za-z0-9+/=]+)$/i.exec(src);
    if (!(match == null ? void 0 : match[1]) || !match[2]) return null;
    try {
      const bytes = figma.base64Decode(match[2]);
      const format = match[1].toLowerCase();
      if (format === "png" && bytes.length >= 24) {
        const width = ((_a = bytes[16]) != null ? _a : 0) << 24 | ((_b = bytes[17]) != null ? _b : 0) << 16 | ((_c = bytes[18]) != null ? _c : 0) << 8 | ((_d = bytes[19]) != null ? _d : 0);
        const height = ((_e = bytes[20]) != null ? _e : 0) << 24 | ((_f = bytes[21]) != null ? _f : 0) << 16 | ((_g = bytes[22]) != null ? _g : 0) << 8 | ((_h = bytes[23]) != null ? _h : 0);
        return width > 0 && height > 0 ? { width: width >>> 0, height: height >>> 0 } : null;
      }
      if (format === "gif" && bytes.length >= 10) {
        const width = ((_i = bytes[6]) != null ? _i : 0) | ((_j = bytes[7]) != null ? _j : 0) << 8;
        const height = ((_k = bytes[8]) != null ? _k : 0) | ((_l = bytes[9]) != null ? _l : 0) << 8;
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if ((format === "jpg" || format === "jpeg") && bytes.length >= 4) {
        let offset = 2;
        while (offset + 8 < bytes.length) {
          if (bytes[offset] !== 255) {
            offset += 1;
            continue;
          }
          const marker = (_m = bytes[offset + 1]) != null ? _m : 0;
          const segmentLength = ((_n = bytes[offset + 2]) != null ? _n : 0) << 8 | ((_o = bytes[offset + 3]) != null ? _o : 0);
          const isStartOfFrame = marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker);
          if (isStartOfFrame && segmentLength >= 7) {
            const height = ((_p = bytes[offset + 5]) != null ? _p : 0) << 8 | ((_q = bytes[offset + 6]) != null ? _q : 0);
            const width = ((_r = bytes[offset + 7]) != null ? _r : 0) << 8 | ((_s = bytes[offset + 8]) != null ? _s : 0);
            return width > 0 && height > 0 ? { width, height } : null;
          }
          if (segmentLength < 2) break;
          offset += segmentLength + 2;
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }
  function renderInline(segments, key) {
    return segments.map(
      (segment, index) => h(
        Span,
        segment.href ? {
          key: `${key}-${index}`,
          href: segment.href,
          fill: "#2563EB",
          textDecoration: "underline"
        } : { key: `${key}-${index}` },
        segment.text
      )
    );
  }
  function renderInlineText(segments, key, props, maxWidth = CONTENT_WIDTH) {
    var _a, _b;
    const internalNodeIds = segments.map((segment) => figmaNodeIdFromHref(segment.href));
    if (!internalNodeIds.some(Boolean)) {
      return h(Text, __spreadProps(__spreadValues({}, props), { key }), renderInline(segments, key));
    }
    const standaloneNodeId = segments.length === 1 ? internalNodeIds[0] : null;
    if (standaloneNodeId) {
      return h(
        Text,
        __spreadProps(__spreadValues({}, props), {
          key,
          fill: "#2563EB",
          textDecoration: "underline",
          onClick: () => handleFigmaNodeClick(standaloneNodeId),
          tooltip: "\u8DF3\u8F6C\u5230\u5BF9\u5E94\u753B\u677F\u6216\u56FE\u5C42",
          hoverStyle: { fill: "#1D4ED8" }
        }),
        (_b = (_a = segments[0]) == null ? void 0 : _a.text) != null ? _b : " "
      );
    }
    const _c = props, { width, key: _ignoredKey } = _c, segmentProps = __objRest(_c, ["width", "key"]);
    const horizontalAlign = props.horizontalAlignText === "right" ? "end" : props.horizontalAlignText === "center" ? "center" : "start";
    return h(
      AutoLayout,
      {
        key,
        width: width != null ? width : "fill-parent",
        direction: "horizontal",
        wrap: true,
        spacing: 0,
        horizontalAlignItems: horizontalAlign,
        verticalAlignItems: "start"
      },
      segments.map((segment, index) => {
        var _a2;
        const nodeId = (_a2 = internalNodeIds[index]) != null ? _a2 : null;
        const linkStyle = segment.href ? { fill: "#2563EB", textDecoration: "underline" } : {};
        const interaction = nodeId ? {
          onClick: () => handleFigmaNodeClick(nodeId),
          tooltip: "\u8DF3\u8F6C\u5230\u5BF9\u5E94\u753B\u677F\u6216\u56FE\u5C42",
          hoverStyle: { fill: "#1D4ED8" }
        } : segment.href ? { href: segment.href } : {};
        return h(
          Text,
          __spreadProps(__spreadValues(__spreadValues(__spreadValues({}, segmentProps), linkStyle), interaction), {
            key: `${key}-${index}`,
            width: "hug-contents",
            maxWidth
          }),
          segment.text
        );
      })
    );
  }
  function plainInlineLength(segments) {
    return segments.reduce((length, segment) => length + segment.text.length, 0);
  }
  function tableColumnWidths(block) {
    var _a;
    const columnCount = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1);
    const weights = Array.from({ length: columnCount }, (_, columnIndex) => {
      var _a2;
      const lengths = [
        plainInlineLength((_a2 = block.header[columnIndex]) != null ? _a2 : []),
        ...block.rows.map((row) => {
          var _a3;
          return plainInlineLength((_a3 = row[columnIndex]) != null ? _a3 : []);
        })
      ];
      return Math.max(1, Math.min(8, Math.sqrt(Math.max(...lengths, 1))));
    });
    const baseWidth = Math.min(84, Math.floor(CONTENT_WIDTH / columnCount));
    const remaining = Math.max(0, CONTENT_WIDTH - baseWidth * columnCount);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const widths = weights.map((weight) => baseWidth + Math.floor(remaining * weight / weightTotal));
    const total = widths.reduce((sum, width) => sum + width, 0);
    widths[widths.length - 1] = ((_a = widths[widths.length - 1]) != null ? _a : 0) + CONTENT_WIDTH - total;
    return widths;
  }
  function tableRowHeight(cells, widths) {
    const lineCount = widths.reduce((maximum, width, columnIndex) => {
      var _a;
      const textLength = Math.max(1, plainInlineLength((_a = cells[columnIndex]) != null ? _a : []));
      const charactersPerLine = Math.max(1, Math.floor((width - 20) / 7));
      return Math.max(maximum, Math.ceil(textLength / charactersPerLine));
    }, 1);
    return Math.max(36, lineCount * 18 + 16);
  }
  function renderTableRow(cells, widths, align, key, header = false) {
    const height = tableRowHeight(cells, widths);
    return h(
      AutoLayout,
      { key, width: CONTENT_WIDTH, height, direction: "horizontal", spacing: 0 },
      widths.map(
        (width, columnIndex) => {
          var _a, _b;
          return h(
            AutoLayout,
            {
              key: `${key}-cell-${columnIndex}`,
              width,
              height,
              padding: { top: 8, right: 10, bottom: 8, left: 10 },
              fill: header ? "#F5F5F5" : "#FFFFFF",
              stroke: "#E5E5E5",
              strokeWidth: 1
            },
            renderInlineText(
              (_a = cells[columnIndex]) != null ? _a : [{ text: " " }],
              `${key}-inline-${columnIndex}`,
              {
                width: Math.max(1, width - 20),
                fontSize: 12,
                fontWeight: header ? 600 : 400,
                lineHeight: "145%",
                fill: "#262626",
                horizontalAlignText: (_b = align[columnIndex]) != null ? _b : "left"
              },
              Math.max(1, width - 20)
            )
          );
        }
      )
    );
  }
  function blockRenderCost(block) {
    if (block.type === "table") {
      const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1);
      return 2 + (block.rows.length + 1) * (columns * 2 + 1);
    }
    if (block.type === "image" || block.type === "quote" || block.type === "bullet" || block.type === "ordered") {
      return 4;
    }
    return 2;
  }
  function fitBlocksToCanvas(blocks) {
    const visible = [];
    let budget = 0;
    let truncated = false;
    for (const block of blocks) {
      const cost = blockRenderCost(block);
      if (budget + cost > CANVAS_NODE_BUDGET) {
        if (block.type === "table") {
          const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1);
          const rowCost = columns * 2 + 1;
          const availableRows = Math.max(0, Math.floor((CANVAS_NODE_BUDGET - budget - 2) / rowCost) - 1);
          if (availableRows > 0) visible.push(__spreadProps(__spreadValues({}, block), { rows: block.rows.slice(0, availableRows) }));
        }
        truncated = true;
        break;
      }
      visible.push(block);
      budget += cost;
    }
    return { visible, truncated: truncated || visible.length < blocks.length };
  }
  function renderBlock(block, index, assets) {
    var _a, _b;
    const key = `block-${index}`;
    switch (block.type) {
      case "heading": {
        const sizes = { 1: 22, 2: 20, 3: 18, 4: 16, 5: 15, 6: 14 };
        return renderInlineText(
          block.inline,
          key,
          {
            key,
            name: `Heading ${block.level}`,
            width: "fill-parent",
            fontSize: (_a = sizes[block.level]) != null ? _a : 14,
            fontWeight: 700,
            lineHeight: "135%",
            fill: "#171717"
          }
        );
      }
      case "bullet":
        return h(
          AutoLayout,
          { key, width: "fill-parent", spacing: 8, verticalAlignItems: "start" },
          [
            h(Text, { key: `${key}-marker`, fontSize: 14, lineHeight: "155%", fill: "#737373" }, "\u2022"),
            renderInlineText(block.inline, `${key}-text`, { width: CONTENT_WIDTH - 24, fontSize: 14, lineHeight: "155%", fill: "#262626" }, CONTENT_WIDTH - 24)
          ]
        );
      case "ordered":
        return h(
          AutoLayout,
          { key, width: "fill-parent", spacing: 8, verticalAlignItems: "start" },
          [
            h(Text, { key: `${key}-marker`, fontSize: 14, lineHeight: "155%", fill: "#737373" }, `${block.order}.`),
            renderInlineText(block.inline, `${key}-text`, { width: CONTENT_WIDTH - 32, fontSize: 14, lineHeight: "155%", fill: "#262626" }, CONTENT_WIDTH - 32)
          ]
        );
      case "quote":
        return h(
          AutoLayout,
          {
            key,
            width: "fill-parent",
            spacing: 10,
            padding: { top: 6, right: 10, bottom: 6, left: 0 },
            fill: "#FAFAFA",
            cornerRadius: 4
          },
          [
            h(Rectangle, { key: `${key}-bar`, width: 3, height: "fill-parent", fill: "#A3A3A3", cornerRadius: 2 }),
            renderInlineText(block.inline, `${key}-text`, { width: CONTENT_WIDTH - 36, fontSize: 14, lineHeight: "155%", fill: "#525252" }, CONTENT_WIDTH - 36)
          ]
        );
      case "code":
        return h(
          AutoLayout,
          {
            key,
            width: "fill-parent",
            padding: 14,
            fill: "#F5F5F5",
            cornerRadius: 6,
            overflow: "hidden"
          },
          h(
            Text,
            { width: CONTENT_WIDTH - 28, fontFamily: "Roboto Mono", fontSize: 12, lineHeight: "155%", fill: "#262626" },
            block.text
          )
        );
      case "divider":
        return h(Frame, { key, width: "fill-parent", height: 1, fill: "#E5E5E5" });
      case "spacer":
        return h(Frame, { key, width: "fill-parent", height: 10 });
      case "table": {
        const widths = tableColumnWidths(block);
        return h(
          AutoLayout,
          { key, width: CONTENT_WIDTH, direction: "vertical", spacing: 0, cornerRadius: 6, overflow: "hidden" },
          [
            renderTableRow(block.header, widths, block.align, `${key}-header`, true),
            ...block.rows.map(
              (row, rowIndex) => renderTableRow(row, widths, block.align, `${key}-row-${rowIndex}`)
            )
          ]
        );
      }
      case "image": {
        const asset = assets.find((candidate) => candidate.id === block.assetId);
        const src = (_b = asset == null ? void 0 : asset.dataUrl) != null ? _b : block.src;
        const sourceDimensions = asset ? { width: asset.width, height: asset.height } : src ? embeddedImageDimensions(src) : null;
        if (!src || !sourceDimensions) {
          return h(
            AutoLayout,
            { key, width: "fill-parent", padding: 12, fill: "#FAFAFA", cornerRadius: 6 },
            h(Text, { fontSize: 12, fill: "#A3A3A3" }, `\u56FE\u7247\u9644\u4EF6\u4E0D\u53EF\u7528\uFF1A${block.alt}`)
          );
        }
        const size = imageSize(sourceDimensions.width, sourceDimensions.height, block.manualWidth);
        return h(
          AutoLayout,
          { key, width: "fill-parent", direction: "vertical", spacing: 6, horizontalAlignItems: "center" },
          [
            h(Image, {
              key: `${key}-image`,
              src,
              width: size.width,
              height: size.height,
              cornerRadius: 6
            }),
            h(Text, { key: `${key}-caption`, fontSize: 12, fill: "#737373" }, block.alt || (asset == null ? void 0 : asset.name) || "\u56FE\u7247")
          ]
        );
      }
      case "paragraph":
      default:
        return renderInlineText(
          block.inline,
          key,
          { width: "fill-parent", fontSize: 14, lineHeight: "155%", fill: "#262626" }
        );
    }
  }
  function MarkdownBlockWidget() {
    const widgetNodeId = useWidgetNodeId();
    const [title, setTitle] = useSyncedState("title", "\u672A\u547D\u540D");
    const [markdown, setMarkdown] = useSyncedState("markdown", "");
    const [assets, setAssets] = useSyncedState("assets", []);
    const [figmaFileKey, setFigmaFileKey] = useSyncedState("figmaFileKey", "");
    const [schemaVersion] = useSyncedState("schemaVersion", WIDGET_SCHEMA_VERSION);
    const blocks = parseWidgetMarkdown(markdown);
    const { visible: visibleBlocks, truncated } = fitBlocksToCanvas(blocks);
    const renderedBlocks = visibleBlocks.map((block, index) => renderBlock(block, index, assets));
    const openEditor = async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (Date.now() < suppressEditorOpenUntil) return;
      return new Promise((resolve) => {
        let resizeOrigin = null;
        const documentFileKey = figma.root.getPluginData(DOCUMENT_FILE_KEY_DATA);
        const legacyFileKey = schemaVersion < WIDGET_SCHEMA_VERSION ? figmaFileKey : "";
        let sessionFileKey = documentFileKey || legacyFileKey;
        if (!documentFileKey && legacyFileKey) {
          figma.root.setPluginData(DOCUMENT_FILE_KEY_DATA, legacyFileKey);
        }
        let settled = false;
        let lastHeartbeat = Date.now();
        let watchdog = null;
        const finishSession = () => {
          if (settled) return;
          settled = true;
          if (watchdog) clearInterval(watchdog);
          figma.off("close", handleClose);
          resolve();
        };
        const handleClose = () => {
          finishSession();
        };
        const upgradeLegacyWidgetsOnCurrentPage = () => {
          var _a;
          const widgetId = figma.widgetId;
          if (!widgetId) return 0;
          let upgraded = 0;
          const legacyFileKeys = /* @__PURE__ */ new Set();
          for (const node of figma.currentPage.findWidgetNodesByWidgetId(widgetId)) {
            if (node.id === widgetNodeId) continue;
            const previous = node.widgetSyncedState;
            if (typeof previous.figmaFileKey === "string" && previous.figmaFileKey) {
              legacyFileKeys.add(previous.figmaFileKey);
            }
            if (previous.schemaVersion === WIDGET_SCHEMA_VERSION) continue;
            const migrated = __spreadProps(__spreadValues({}, previous), {
              title: typeof previous.title === "string" ? previous.title : "\u672A\u547D\u540D",
              markdown: typeof previous.markdown === "string" ? previous.markdown : typeof previous.content === "string" ? previous.content : "",
              assets: Array.isArray(previous.assets) ? previous.assets : [],
              figmaFileKey: typeof previous.figmaFileKey === "string" ? previous.figmaFileKey : "",
              schemaVersion: WIDGET_SCHEMA_VERSION
            });
            node.setWidgetSyncedState(migrated);
            upgraded += 1;
          }
          if (!sessionFileKey && legacyFileKeys.size === 1) {
            sessionFileKey = (_a = Array.from(legacyFileKeys)[0]) != null ? _a : "";
            if (sessionFileKey) figma.root.setPluginData(DOCUMENT_FILE_KEY_DATA, sessionFileKey);
          }
          return upgraded;
        };
        const upgradedCount = upgradeLegacyWidgetsOnCurrentPage();
        if (upgradedCount > 0) figma.notify(`\u5DF2\u4FDD\u7559\u6570\u636E\u5E76\u5347\u7EA7 ${upgradedCount} \u4E2A\u65E7\u7248 MD Block`);
        figma.showUI(__html__, {
          width: 480,
          height: 640,
          title: "MD Block",
          themeColors: true
        });
        figma.on("close", handleClose);
        watchdog = setInterval(() => {
          if (Date.now() - lastHeartbeat > 12e3) finishSession();
        }, 3e3);
        figma.ui.onmessage = async (message) => {
          const insertSelectedFrameLink = (fileKey) => {
            const selectedNode = findSelectedSceneNode(widgetNodeId);
            if (!selectedNode) {
              figma.ui.postMessage({
                type: "error",
                message: "\u8BF7\u5148\u5728\u753B\u5E03\u4E2D\u9009\u62E9\u4E00\u4E2A\u753B\u677F\u6216\u56FE\u5C42\uFF0C\u518D\u70B9\u51FB\u63D2\u5165\u6309\u94AE\u3002"
              });
              return;
            }
            figma.ui.postMessage({
              type: "frame-link-ready",
              nodeId: selectedNode.id,
              name: selectedNode.name || "\u672A\u547D\u540D\u56FE\u5C42",
              url: createNodeUrl(selectedNode, fileKey)
            });
          };
          switch (message.type) {
            case "ui-heartbeat":
              lastHeartbeat = Date.now();
              break;
            case "ui-closing":
              finishSession();
              break;
            case "ready":
              lastHeartbeat = Date.now();
              figma.ui.postMessage({
                type: "init",
                data: { title, markdown, assets, figmaFileKey: sessionFileKey },
                canEdit: true
              });
              break;
            case "save":
              setTitle(message.data.title);
              setMarkdown(message.data.markdown);
              if (message.data.figmaFileKey !== void 0) {
                sessionFileKey = message.data.figmaFileKey;
                setFigmaFileKey(sessionFileKey);
              }
              setAssets(
                message.data.assets.filter(
                  (asset) => message.data.markdown.includes(`figma-asset://${asset.id}`)
                )
              );
              figma.ui.postMessage({ type: "saved" });
              break;
            case "resize-start":
              resizeOrigin = figma.ui.getPosition().canvasSpace;
              break;
            case "resize": {
              const origin = resizeOrigin;
              if (origin && (message.offsetX !== 0 || message.offsetY !== 0)) {
                const zoom = Math.max(figma.viewport.zoom, 0.01);
                figma.ui.reposition(
                  origin.x + message.offsetX / zoom,
                  origin.y + message.offsetY / zoom
                );
              }
              figma.ui.resize(message.width, message.height);
              break;
            }
            case "resize-end":
              resizeOrigin = null;
              break;
            case "insert-selected-frame": {
              if (!sessionFileKey) {
                figma.ui.postMessage({ type: "file-link-required" });
                break;
              }
              insertSelectedFrameLink(sessionFileKey);
              break;
            }
            case "set-figma-file-url": {
              const fileKey = extractFigmaFileKey(message.url);
              if (!fileKey) {
                figma.ui.postMessage({
                  type: "error",
                  message: "\u65E0\u6CD5\u8BC6\u522B\u8BE5\u6587\u4EF6\u94FE\u63A5\u3002\u8BF7\u5728\u5F53\u524D Figma \u6587\u4EF6\u4E2D\u590D\u5236\u6587\u4EF6\u94FE\u63A5\u540E\u91CD\u8BD5\u3002"
                });
                break;
              }
              sessionFileKey = fileKey;
              figma.root.setPluginData(DOCUMENT_FILE_KEY_DATA, fileKey);
              setFigmaFileKey(fileKey);
              figma.ui.postMessage({ type: "file-link-configured", fileKey });
              if (message.insertSelected) insertSelectedFrameLink(fileKey);
              break;
            }
            case "navigate-node": {
              const node = await figma.getNodeByIdAsync(message.nodeId);
              if (!node || !isSceneNode(node)) {
                figma.ui.postMessage({ type: "error", message: "\u5BF9\u5E94\u753B\u677F\u5DF2\u4E0D\u5B58\u5728\u3002" });
                break;
              }
              const page = containingPage(node);
              if (page && page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
              figma.currentPage.selection = [node];
              figma.viewport.scrollAndZoomIntoView([node]);
              figma.notify(`\u5DF2\u5B9A\u4F4D\u5230\u300C${node.name}\u300D`);
              break;
            }
            case "notify":
              figma.notify(message.message);
              break;
          }
        };
      });
    };
    return h(
      AutoLayout,
      {
        name: "MD Block",
        width: 760,
        direction: "vertical",
        spacing: 14,
        padding: { top: 24, right: 20, bottom: 24, left: 20 },
        cornerRadius: 10,
        fill: "#FFFFFF",
        stroke: "#E5E5E5",
        strokeWidth: 1,
        onClick: openEditor
      },
      [
        h(Text, { key: "document-title", width: "fill-parent", fontSize: 20, fontWeight: 700, lineHeight: "135%", fill: "#171717" }, title || "\u672A\u547D\u540D"),
        h(Rectangle, { key: "document-divider", width: "fill-parent", height: 1, fill: "#E5E5E5" }),
        ...visibleBlocks.length > 0 ? renderedBlocks : [h(Text, { key: "empty-state", width: "fill-parent", fontSize: 14, fill: "#A3A3A3" }, "\u6682\u65E0 Markdown \u5185\u5BB9")],
        ...truncated ? [
          h(
            Text,
            { key: "content-truncated", width: "fill-parent", fontSize: 12, fill: "#737373" },
            "\u5185\u5BB9\u8F83\u591A\uFF0C\u753B\u5E03\u4EC5\u5C55\u793A\u90E8\u5206\u5185\u5BB9 \xB7 \u70B9\u51FB\u6253\u5F00\u5B8C\u6574\u6587\u6863"
          )
        ] : []
      ]
    );
  }
  widget.register(MarkdownBlockWidget);
})();
