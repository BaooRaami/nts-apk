const { createApp, ref, reactive, computed, onMounted, watch } = Vue;

// ===== Date Helper =====
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

// ===== Share Helper =====
async function shareText(text) {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    await window.Capacitor.Plugins.Share.share({ text });
  } else if (navigator.share) {
    navigator.share({ text });
  } else {
    navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
  }
}

// ===== Vue App =====
createApp({
  setup() {
    // -- State --
    const page = ref('dashboard');
    const tests = ref([]);
    const activeTest = ref(null);
    const activeTab = ref('home');
    const showSheet = ref(false);
    const sheetMode = ref('create');
    const sheetName = ref('');
    const sheetDate = ref(todayISO());
    const sheetPsid = ref('');
    const editingId = ref(null);
    const showRoomSheet = ref(false);
    const showManualSheet = ref(false);
    const manualRoomNumber = ref('');
    const scanPreviewUrl = ref(null);
    const scanFile = ref(null);
    const scanProcessing = ref(false);
    const showExitToast = ref(false);

    // -- Rooms State --
    const rooms = ref([]);
    const expandedRoomId = ref(null);

    // -- Attendance State --
    const attendanceMap = ref({});
    const attendanceInput = ref({});
    const attendanceInputRefs = {};
    // -- Attendance Filter --
    const attendanceFilter = ref('all');
    const showFilterSheet = ref(false);

    const filteredRooms = computed(() => {
      if (attendanceFilter.value === 'all') return rooms.value;
      return rooms.value.filter(room => {
        const att = attendanceMap.value[room.id];
        const isMarked = att && att.present !== '' && att.present !== null && att.present !== undefined;
        if (attendanceFilter.value === 'marked') return isMarked;
        if (attendanceFilter.value === 'unmarked') return !isMarked;
        return true;
      });
    });

    function openFilterSheet() { showFilterSheet.value = true; }
    function closeFilterSheet() { showFilterSheet.value = false; }
    function setFilter(filter) { attendanceFilter.value = filter; closeFilterSheet(); }

    watch(manualRoomNumber, (val) => {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num < 1) manualRoomNumber.value = '1';
    });

    // -- Tabs --
    const tabs = [
      { id: 'home', label: 'Home', icon: icons.home },
      { id: 'rooms', label: 'Rooms', icon: icons.rooms },
      { id: 'attendance', label: 'Attendance', icon: icons.attendance },
      { id: 'search', label: 'Search', icon: icons.search },
    ];

    // -- Load tests from IndexedDB --
    async function loadTests() {
      tests.value = await getAllTests();
    }

    async function loadRooms() {
      if (!activeTest.value) {
        rooms.value = [];
        attendanceMap.value = {};
        return;
      }
      rooms.value = await getRoomsByTest(activeTest.value.id);
      const attList = await getAttendanceByTest(activeTest.value.id);
      const map = {};
      for (const a of attList) map[a.roomId] = a;
      attendanceMap.value = map;
    }

onMounted(() => {
      loadTests();

      // -- Hardware / swipe back button --
      let backPressedOnce = false;

      if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        window.Capacitor.Plugins.App.addListener('backButton', () => {
          // Priority 1: close any open sheet or overlay
          if (showSheet.value)        { closeSheet();       return; }
          if (showRoomSheet.value)    { closeRoomSheet();   return; }
          if (showManualSheet.value)  { closeManualSheet(); return; }
          if (showFilterSheet.value)  { closeFilterSheet(); return; }
          if (scanPreviewUrl.value)   { closeScanPreview(); return; }

          // Priority 2: go back from test page to dashboard
          if (page.value === 'test') { goBack(); return; }

          // Priority 3: on dashboard — double-press to exit
          if (backPressedOnce) {
            window.Capacitor.Plugins.App.exitApp();
            return;
          }
          backPressedOnce = true;
          showExitToast.value = true;
          setTimeout(() => {
            backPressedOnce = false;
            showExitToast.value = false;
          }, 2000);
        });
      }
    });

    // -- Sheet Actions --
    function openCreateSheet() {
      sheetMode.value = 'create';
      sheetName.value = '';
      sheetDate.value = todayISO();
      sheetPsid.value = '';
      editingId.value = null;
      showSheet.value = true;
    }

    function openEditSheet(test) {
      sheetMode.value = 'edit';
      sheetName.value = test.name;
      sheetDate.value = test.date;
      sheetPsid.value = test.psid || '';
      editingId.value = test.id;
      showSheet.value = true;
    }

    function closeSheet() {
      showSheet.value = false;
      sheetName.value = '';
      sheetDate.value = todayISO();
      sheetPsid.value = '';
      editingId.value = null;
    }

    function openRoomSheet() {
      showRoomSheet.value = true;
    }

    function closeRoomSheet() {
      showRoomSheet.value = false;
    }

    function onScanImage() {
      closeRoomSheet();
      const input = document.querySelector('input[type=\"file\"][capture]');
      if (input) input.click();
    }

    function onPickImage() {
      closeRoomSheet();
      const input = document.querySelector('input[type=\"file\"]:not([capture])');
      if (input) input.click();
    }

    function onScanFileSelected(event) {
      const file = event.target.files[0];
      if (!file) return;
      scanFile.value = file;
      scanPreviewUrl.value = URL.createObjectURL(file);
      event.target.value = '';
    }

    function closeScanPreview() {
      if (scanPreviewUrl.value) URL.revokeObjectURL(scanPreviewUrl.value);
      scanPreviewUrl.value = null;
      scanFile.value = null;
      scanProcessing.value = false;
    }

    async function processScannedImage() {
      if (!scanFile.value || !activeTest.value) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const base64Image = reader.result;
        scanProcessing.value = true;

        try {
          const prompt = "This is a sitting plan with rooms, starting and ending roll number. Just give me 3 Inputs: Room, Start, End. Nothing else. Respond in valid JSON.";

          const body = {
            model: 'mistral',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: base64Image } }
              ]
            }],
            response_format: { type: "json_object" }
          };

          const res = await fetch(`https://gen.pollinations.ai/v1/chat/completions?key=sk_KdVQD7TO5iEBCNjOkyXdTdS8zPJfjssm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          const data = await res.json();
          const aiRes = data.choices[0].message.content;
          let parsed = JSON.parse(aiRes);
          const roomsArray = Array.isArray(parsed) ? parsed : Object.values(parsed)[0];

          // Group entries by room name
          const grouped = {};
          for (const entry of roomsArray) {
            const name = entry.room || 'Unknown';
            if (!grouped[name]) grouped[name] = [];
            grouped[name].push({ startRoll: entry.start || null, endRoll: entry.end || null });
          }

          const testId = activeTest.value.id;

          for (const [name, ranges] of Object.entries(grouped)) {
            let capacity = 0;
            for (const range of ranges) {
              const start = parseInt(range.startRoll, 10);
              const end = parseInt(range.endRoll, 10);
              if (!isNaN(start) && !isNaN(end) && end >= start) capacity += end - start + 1;
            }
            const room = {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
              testId: testId,
              name: name,
              rollRanges: ranges,
              capacity: capacity,
              createdAt: Date.now(),
            };
            await addRoom(room);
          }

          await loadRooms();
          closeScanPreview();

        } catch (e) {
          scanProcessing.value = false;
          alert('Error processing image: ' + e.message);
        }
      };

      reader.readAsDataURL(scanFile.value);
    }

    function onAddManually() {
      closeRoomSheet();
      manualRoomNumber.value = '';
      showManualSheet.value = true;
    }

    function closeManualSheet() {
      showManualSheet.value = false;
      manualRoomNumber.value = '';
    }

    async function saveManualRoom() {
      const num = parseInt(manualRoomNumber.value, 10);
      if (!num || num < 1 || !activeTest.value) return;

      const testId = activeTest.value.id;
      const existingRooms = await getRoomsByTest(testId);
      const startNum = existingRooms.length + 1;

      for (let i = 0; i < num; i++) {
        const room = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + i,
          testId: testId,
          name: `Room ${startNum + i}`,
          rollRanges: [{ startRoll: null, endRoll: null }],
          capacity: 0,
          createdAt: Date.now(),
        };
        await addRoom(room);
      }

      await loadRooms();
      closeManualSheet();
    }

    function toPlainRoom(room) {
      const plain = JSON.parse(JSON.stringify(room));
      if (plain.rollRanges) {
        for (const range of plain.rollRanges) {
          if (range.startRoll === '' || range.startRoll === undefined) range.startRoll = null;
          if (range.endRoll === '' || range.endRoll === undefined) range.endRoll = null;
        }
      }
      return plain;
    }

    function roomCapacity(room) {
      if (!room.rollRanges || room.rollRanges.length === 0) return 0;
      let total = 0;
      for (const range of room.rollRanges) {
        const start = parseInt(range.startRoll, 10);
        const end = parseInt(range.endRoll, 10);
        if (!isNaN(start) && !isNaN(end) && end >= start) total += end - start + 1;
      }
      return total;
    }

    async function saveRoom(room) {
      const plain = toPlainRoom(room);
      
      let capacity = 0;
      for (const range of plain.rollRanges || []) {
        const start = parseInt(range.startRoll, 10);
        const end = parseInt(range.endRoll, 10);
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          capacity += end - start + 1;
        }
      }
      plain.capacity = capacity;
      
      await updateRoom(plain);

      room.capacity = capacity;
    }

    async function deleteRoom(room) {
      await removeRoom(room.id);
      if (expandedRoomId.value === room.id) expandedRoomId.value = null;
      await loadRooms();
    }
    
    async function addRangeSeries(room) {
      if (!room.rollRanges) room.rollRanges = [];
      room.rollRanges.push({ startRoll: null, endRoll: null });
      await saveRoom(room);
    }

    async function cleanupAndSaveRoom(roomId) {
      const room = rooms.value.find(r => r.id === roomId);
      if (room && room.rollRanges && room.rollRanges.length > 1) {
        for (let i = room.rollRanges.length - 1; i > 0; i--) {
          const r = room.rollRanges[i];
          const isEmpty = (r.startRoll === null || r.startRoll === '' || r.startRoll === undefined) &&
                          (r.endRoll === null || r.endRoll === '' || r.endRoll === undefined);
          if (isEmpty) room.rollRanges.splice(i, 1);
        }
        await saveRoom(room);
      }
    }

    async function toggleRoomDetail(roomId) {
      if (expandedRoomId.value === roomId) {
        await cleanupAndSaveRoom(roomId);
        expandedRoomId.value = null;
      } else {
        expandedRoomId.value = roomId;
      }
    }

    async function saveSheet() {
      const name = sheetName.value.trim();
      if (!name) return;

      if (sheetMode.value === 'create') {
        const test = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          name: name,
          date: sheetDate.value,
          psid: sheetPsid.value.trim(),
          createdAt: Date.now(),
        };
        await addTest(test);
      } else {
        await updateTest({ id: editingId.value, name: name, date: sheetDate.value, psid: sheetPsid.value.trim() });
      }

      await loadTests();
      closeSheet();
    }

    async function deleteTest() {
      if (!editingId.value) return;
      if (!confirm('Are you sure you want to delete this test?')) return;
      await removeTest(editingId.value);
      await loadTests();
      closeSheet();
    }

    // -- Navigation --
    async function openTest(test) {
      activeTest.value = test;
      activeTab.value = 'home';
      page.value = 'test';
      await loadRooms();
    }

    async function goBack() {
      if (expandedRoomId.value) await cleanupAndSaveRoom(expandedRoomId.value);
      for (const room of rooms.value) {
        const att = attendanceMap.value[room.id];
        if (att && (att.present !== '' && att.present !== null && att.present !== undefined)) {
          const plain = {
            id: att.id,
            testId: att.testId,
            roomId: att.roomId,
            present: att.present,
            absent: att.absent,
            updatedAt: att.updatedAt,
          };
          await saveAttendance(plain);
        }
      }
      activeTest.value = null;
      rooms.value = [];
      expandedRoomId.value = null;
      attendanceMap.value = {};
      page.value = 'dashboard';
    }

    function getTabIcon() {
      const tab = tabs.find(t => t.id === activeTab.value);
      return tab ? tab.icon : icons.empty;
    }

    function getTabTitle() {
      const tab = tabs.find(t => t.id === activeTab.value);
      return tab ? tab.label : '';
    }

    // -- Search --
    const searchQuery = ref('');

    // -- Dashboard Stats --
    const markedBarPresent = computed(() => {
      if (!markedStats.value.total) return 0;
      return Math.round((markedStats.value.present / markedStats.value.total) * 100);
    });
    const markedBarAbsent = computed(() => {
      if (!markedStats.value.total) return 0;
      return Math.round((markedStats.value.absent / markedStats.value.total) * 100);
    });
    const allBarPresent = computed(() => {
      if (!allStats.value.total) return 0;
      return Math.round((allStats.value.present / allStats.value.total) * 100);
    });
    const allBarAbsent = computed(() => {
      if (!allStats.value.total) return 0;
      return Math.round((allStats.value.absent / allStats.value.total) * 100);
    });

    const markedRoomCount = computed(() => {
      let count = 0;
      for (const room of rooms.value) {
        const att = attendanceMap.value[room.id];
        if (att && att.present !== '' && att.present !== null && att.present !== undefined) count++;
      }
      return count;
    });

    const markedStats = computed(() => {
      let present = 0, absent = 0, total = 0;
      for (const room of rooms.value) {
        const att = attendanceMap.value[room.id];
        if (att && att.present !== '' && att.present !== null && att.present !== undefined) {
          const cap = getTotal(room);
          present += att.present;
          absent += (typeof att.absent === 'number' ? att.absent : 0);
          total += cap;
        }
      }
      return { present, absent, total };
    });

    const allStats = computed(() => {
      let present = 0, absent = 0, total = 0;
      for (const room of rooms.value) {
        const cap = getTotal(room);
        const att = attendanceMap.value[room.id];
        if (att && att.present !== '' && att.present !== null && att.present !== undefined) {
          present += att.present;
          absent += (typeof att.absent === 'number' ? att.absent : 0);
        } else {
          absent += cap;
        }
        total += cap;
      }
      return { present, absent, total };
    });

    const searchResults = computed(() => {
      const q = String(searchQuery.value || '').trim();
      if (!q || rooms.value.length === 0) return [];

      const results = [];
      for (const room of rooms.value) {
        if (!room.rollRanges) continue;
        let exactMatch = false;
        let partialMatch = false;
        for (const range of room.rollRanges) {
          const start = parseInt(range.startRoll, 10);
          const end = parseInt(range.endRoll, 10);
          if (isNaN(start) || isNaN(end)) continue;
          const num = parseInt(q, 10);
          if (!isNaN(num) && num >= start && num <= end) { exactMatch = true; break; }
          if (!isNaN(num)) {
            const qStr = String(num);
            const padLen = String(start).length;
            const prefixStart = parseInt(qStr.padEnd(padLen, '0'), 10);
            const prefixEnd = parseInt(qStr.padEnd(padLen, '9'), 10);
            if (prefixStart <= end && prefixEnd >= start) partialMatch = true;
          }
        }
        if (exactMatch || partialMatch) {
          results.push({ room, exactMatch });
        }
      }
      results.sort((a, b) => b.exactMatch - a.exactMatch);
      return results;
    });

    function focusNextRoom(currentRoom) {
      const list = filteredRooms.value;
      const idx = list.findIndex(r => r.id === currentRoom.id);
      for (let i = idx + 1; i < list.length; i++) {
        const nextRoom = list[i];
        const el = attendanceInputRefs[nextRoom.id];
        if (el) { el.focus(); el.select(); return; }
      }
    }

    function clearSearch() { searchQuery.value = ''; }

    async function shareAllCard() {
      const text = [
        `*${activeTest.value.name}*`,
        activeTest.value.psid ? `*PSID: ${activeTest.value.psid}*` : null,
        '',
        `Present: ${allStats.value.present}`,
        `Absent: ${allStats.value.absent}`,
        `Total: ${allStats.value.total}`,
      ].filter(line => line !== null).join('\n');
      await shareText(text);
    }

    async function shareMarkedCard() {
      const markedRooms = rooms.value.filter(room => {
        const att = attendanceMap.value[room.id];
        return att && att.present !== '' && att.present !== null && att.present !== undefined;
      });
      if (markedRooms.length === 0) return;

      const longest = Math.max(...markedRooms.map(r => r.name.length), 4);
      const col1 = longest, col2 = 5, col3 = 5, col4 = 7;
      const pad = (str, len) => String(str).padEnd(len, ' ');
      const sep = `${'-'.repeat(col1)}-|-${'-'.repeat(col2)}-|-${'-'.repeat(col3)}-|-${'-'.repeat(col4)}`;

      let lines = [];
      lines.push('*Attendance*');
      lines.push('');
      lines.push(`${pad('Room', col1)} | ${pad('P', col2)} | ${pad('A', col3)} | ${pad('Total', col4)}`);
      lines.push(sep);

      let totalP = 0, totalA = 0, totalAll = 0;
      for (const room of markedRooms) {
        const att = attendanceMap.value[room.id];
        const total = getTotal(room);
        const p = att.present;
        const a = typeof att.absent === 'number' ? att.absent : (total - p);
        totalP += p; totalA += a; totalAll += total;
        lines.push(`${pad(room.name, col1)} | ${pad(p, col2)} | ${pad(a, col3)} | ${pad(total, col4)}`);
      }

      lines.push(sep);
      lines.push(`${pad('Total', col1)} | ${pad(totalP, col2)} | ${pad(totalA, col3)} | ${pad(totalAll, col4)}`);

      await shareText(lines.join('\n'));
    }

    // -- Attendance --
    function getTotal(room) {
      return roomCapacity(room);
    }

    function getPresent(roomId) {
      return attendanceMap.value[roomId]?.present ?? '';
    }

    function getAbsent(roomId) {
      const att = attendanceMap.value[roomId];
      if (!att || att.present === '' || att.present === null || att.present === undefined) return '—';
      const total = getTotal(rooms.value.find(r => r.id === roomId));
      if (!total) return '—';
      return total - att.present;
    }

    function onPresentInput(room, event) {
      const total = getTotal(room);
      const raw = event.target.value;
      if (total && raw !== '' && parseInt(raw, 10) > total) {
        event.target.value = '';
        attendanceInput.value[room.id] = '';
      } else {
        attendanceInput.value[room.id] = raw;
      }
    }

    async function onPresentBlur(room) {
      const val = attendanceInput.value[room.id];
      let present = val === '' || val === undefined ? '' : parseInt(val, 10);
      const total = getTotal(room);
      if (present !== '' && !isNaN(present) && total && present > total) present = total;
      let absent = '—';
      if (present !== '' && !isNaN(present) && total) {
        absent = Math.max(0, total - present);
      }
      const plain = {
        id: room.id,
        testId: activeTest.value.id,
        roomId: room.id,
        present: present,
        absent: absent,
        updatedAt: Date.now(),
      };
      attendanceMap.value[room.id] = plain;
      delete attendanceInput.value[room.id];
      await saveAttendance(JSON.parse(JSON.stringify(plain)));
    }    
    async function saveAttendanceForRoom(room) {
      const att = attendanceMap.value[room.id];
      if (att) await saveAttendance(att);
    }

    // -- Expose to template --
    return {
      page, tests, activeTest, activeTab, showSheet, sheetMode, sheetName, sheetDate,
      showRoomSheet, showManualSheet, manualRoomNumber, sheetPsid, tabs, icons, formatDate,
      rooms, expandedRoomId,
      scanPreviewUrl, scanProcessing,
      searchQuery, searchResults,
      openCreateSheet, openEditSheet, closeSheet, saveSheet, deleteTest, openTest,
      goBack, getTabIcon, getTabTitle, openRoomSheet, closeRoomSheet, onScanImage,
      onScanFileSelected, closeScanPreview, processScannedImage,
      onAddManually, closeManualSheet, saveManualRoom, onPickImage,
      deleteRoom, cleanupAndSaveRoom, toggleRoomDetail, roomCapacity, saveRoom, addRangeSeries,
      clearSearch,
      attendanceMap, attendanceInput,
      getPresent, getAbsent, getTotal, onPresentInput, onPresentBlur, saveAttendanceForRoom,
      markedStats, allStats, markedRoomCount,
      markedBarPresent, markedBarAbsent, allBarPresent, allBarAbsent,
      attendanceFilter, showFilterSheet, filteredRooms,
      openFilterSheet, closeFilterSheet, setFilter,
      attendanceInputRefs, focusNextRoom,
      shareMarkedCard, shareAllCard,
      showExitToast,
    };
  }
}).mount('#app');