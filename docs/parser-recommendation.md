# DJI Log Parser Implementation Recommendation

## Research Summary

### Step 1: XOR Unscrambling Algorithm Review ✅

**Key Findings from djilogs.live555.com:**

1. **Record Structure:**
   - 1-byte record type
   - 1-byte record length  
   - Payload (scrambled)
   - 1-byte end marker (0xFF)

2. **XOR Scrambling Process:**
   - First byte of payload + record type → generates 8 scramble bytes
   - Scramble bytes generated via CRC64 algorithm (`getScrambleByte()` function)
   - Remaining payload bytes are XORed with scramble bytes
   - Formula: `unscrambled_payload[i-1] = scrambled_payload[i] XOR scramble_bytes[i % 8]`

3. **GPS Coordinates Location:**
   - Stored in **OSD (On-Screen Display) record type**
   - Coordinates are in **microdegrees** (4-byte integers, divide by 10⁷ to get degrees)
   - Format: little-endian 32-bit integers

4. **File Structure for DJI Fly (RC2):**
   - Header (100 bytes) → **Details Area** → Records Area
   - Note: DJI GO has reverse order (Records before Details)

### Step 2: Library Evaluation ✅

**dji-log-parser (Rust Library)**
- **Repository:** https://github.com/lvauvillier/dji-log-parser
- **Language:** Rust (compiled binary)
- **Capabilities:**
  - Parses all DJI log versions including encrypted (v13+)
  - Supports CSV, GeoJSON, KML export
  - Handles XOR unscrambling and record parsing
  
**Integration Options:**
- ❌ No npm package available
- ❌ No WebAssembly (WASM) build available
- ❌ No Node.js bindings
- ✅ Could be used as CLI tool via child process
- ✅ Could be used as reference implementation for TypeScript port

**djiparsetxt (C++ Source)**
- **Location:** djilogs.live555.com
- **Language:** C++
- **Status:** Source code available, needs compilation
- **Pros:** Well-documented, proven implementation
- **Cons:** Requires C++ compilation, not directly usable in Node.js/TypeScript

## Recommendation: Hybrid Approach (Option 3)

Based on the research, I recommend a **Hybrid Approach** for the following reasons:

### Why Hybrid?

1. **Complexity vs. Time Trade-off:**
   - Implementing full parser with XOR unscrambling from scratch = 2-3 weeks of work
   - Using existing tools + conversion = 1-2 days
   - Custom implementation for long-term = 1-2 weeks

2. **Immediate Solution:**
   - Use `dji-log-parser` CLI tool (Rust) as a preprocessing step
   - Convert logs to GeoJSON/CSV on the server
   - Import converted data into your database
   - This provides **immediate, accurate results**

3. **Future Custom Implementation:**
   - Port the XOR unscrambling algorithm to TypeScript
   - Implement proper record structure parsing
   - Add as enhancement once basic functionality works

### Implementation Plan

#### Phase 1: Quick Win (Recommended Start)

1. **Create API Route** (`/api/parse-dji-log`):
   ```typescript
   // Accept file upload
   // Call dji-log-parser CLI tool
   // Convert output to our format
   // Save to database
   ```

2. **Install dji-log-parser:**
   - Download Rust binary or build from source
   - Store in server directory
   - Call via Node.js child process

3. **Conversion Script:**
   - Parse GeoJSON/CSV output from dji-log-parser
   - Map to our FlightLog data structure
   - Save to Supabase

**Benefits:**
- ✅ Accurate GPS coordinates (uses proven parser)
- ✅ Handles all DJI log versions
- ✅ Fast implementation (days, not weeks)
- ✅ Can be done immediately

**Drawbacks:**
- ⚠️ Requires Rust binary (adds dependency)
- ⚠️ File processing happens server-side
- ⚠️ Adds processing step

#### Phase 2: Custom TypeScript Parser (Future Enhancement)

Once Phase 1 is working, implement a pure TypeScript parser:

1. **Port XOR unscrambling algorithm:**
   - Implement CRC64 function
   - Implement `getScrambleByte()` equivalent
   - Port unscrambling logic

2. **Implement record parsing:**
   - Parse header to find Records Area
   - Parse record structure (type, length, payload)
   - Unscramble payloads
   - Extract OSD records

3. **Parse OSD records:**
   - Extract GPS coordinates (4-byte ints, microdegrees)
   - Extract altitude, speed, etc.
   - Convert to our data format

**Benefits:**
- ✅ Pure TypeScript (no external dependencies)
- ✅ Client-side parsing possible
- ✅ Full control over implementation

**Estimated Time:** 1-2 weeks for full implementation

### Code References Found

**XOR Unscrambling Algorithm:**
- Location: `djilogs.live555.com/doxygen/html/scrambleBytes_8cpp_source.html`
- Key function: `getScrambleByte(recordType, keyByte, resultScrambleBytes)`
- Uses CRC64 table for generating scramble bytes

**OSD Record Parsing:**
- Location: `djilogs.live555.com/doxygen/html/parseRecord__OSD_8cpp_source.html`
- Shows exact byte offsets for GPS coordinates
- Format: microdegrees (int32, divide by 1e7)

### Final Recommendation

**Start with Phase 1 (Hybrid Approach):**
1. Use `dji-log-parser` CLI tool for immediate accurate parsing
2. Process files server-side via API route
3. Convert output to your data format
4. Save to database

**Plan Phase 2 (Custom Parser):**
1. Once Phase 1 is stable, port algorithm to TypeScript
2. Implement proper record parsing
3. Replace CLI tool with pure TypeScript implementation
4. Enables client-side parsing if desired

This approach gives you:
- ✅ **Immediate working solution** (accurate GPS coordinates)
- ✅ **Long-term maintainability** (pure TypeScript)
- ✅ **Proven accuracy** (uses reverse-engineered algorithm)
- ✅ **Flexibility** (can process client-side later)

### Next Steps

1. **Set up Phase 1:**
   - Download/build `dji-log-parser` binary
   - Create API route for file processing
   - Test with your log files
   - Verify GPS coordinates are accurate

2. **Document Phase 2 plan:**
   - Keep algorithm references for future implementation
   - Plan TypeScript port of XOR unscrambling
   - Design proper record structure parser

This hybrid approach provides the best balance of speed, accuracy, and maintainability.

