import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Star, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatDateISO(y, m, d) {
  return y + '-' + pad(m) + '-' + pad(d)
}

var MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

var DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function ReservationCalendar() {
  var now = new Date()
  var monthState = useState(now.getMonth())
  var currentMonth = monthState[0]
  var setCurrentMonth = monthState[1]

  var yearState = useState(now.getFullYear())
  var currentYear = yearState[0]
  var setCurrentYear = yearState[1]

  var coverDataState = useState({})
  var coverData = coverDataState[0]
  var setCoverData = coverDataState[1]

  var eventDataState = useState({})
  var eventData = eventDataState[0]
  var setEventData = eventDataState[1]

  var loadingState = useState(true)
  var loading = loadingState[0]
  var setLoading = loadingState[1]

  var navigate = useNavigate()

  useEffect(function() {
    loadMonthData()
  }, [currentMonth, currentYear])

  function loadMonthData() {
    setLoading(true)

    var firstDay = formatDateISO(currentYear, currentMonth + 1, 1)
    var lastDayDate = new Date(currentYear, currentMonth + 1, 0)
    var lastDay = formatDateISO(currentYear, currentMonth + 1, lastDayDate.getDate())

    // Carica riepilogo coperti del mese
    supabase
      .from('reservations')
      .select('reservation_date, meal_type, guests_count, adults_count, children_count, status')
      .gte('reservation_date', firstDay)
      .lte('reservation_date', lastDay)
      .not('status', 'eq', 'cancelled')
      .then(function(result) {
        if (result.error) {
          console.error('Errore caricamento coperti:', result.error)
          setCoverData({})
        } else {
          var grouped = {}
          for (var i = 0; i < result.data.length; i++) {
            var r = result.data[i]
            var key = r.reservation_date + '_' + r.meal_type
            if (!grouped[key]) {
              grouped[key] = { total: 0, adults: 0, children: 0, count: 0 }
            }
            grouped[key].total += r.guests_count
            grouped[key].adults += r.adults_count
            grouped[key].children += r.children_count
            grouped[key].count += 1
          }
          setCoverData(grouped)
        }

        // Carica eventi del mese
        return supabase
          .from('event_dates')
          .select('*')
          .gte('event_date', firstDay)
          .lte('event_date', lastDay)
      })
      .then(function(result) {
        if (result && !result.error) {
          var events = {}
          for (var i = 0; i < result.data.length; i++) {
            var ev = result.data[i]
            var key = ev.event_date
            if (!events[key]) {
              events[key] = []
            }
            events[key].push(ev)
          }
          setEventData(events)
        }
        setLoading(false)
      })
  }

  function changeMonth(delta) {
    var newMonth = currentMonth + delta
    var newYear = currentYear
    if (newMonth < 0) {
      newMonth = 11
      newYear = currentYear - 1
    } else if (newMonth > 11) {
      newMonth = 0
      newYear = currentYear + 1
    }
    setCurrentMonth(newMonth)
    setCurrentYear(newYear)
  }

  function goToToday() {
    var today = new Date()
    setCurrentMonth(today.getMonth())
    setCurrentYear(today.getFullYear())
  }

  // Calcola i giorni del calendario (inclusi i giorni del mese precedente/successivo per riempire la griglia)
  function getCalendarDays() {
    var firstOfMonth = new Date(currentYear, currentMonth, 1)
    var lastOfMonth = new Date(currentYear, currentMonth + 1, 0)

    // Giorno della settimana del primo giorno (0=dom -> convertiamo: 0=lun)
    var startDow = firstOfMonth.getDay()
    // Converti da dom=0 a lun=0
    startDow = startDow === 0 ? 6 : startDow - 1

    var daysInMonth = lastOfMonth.getDate()
    var days = []

    // Giorni del mese precedente
    for (var i = startDow - 1; i >= 0; i--) {
      var prevDate = new Date(currentYear, currentMonth, -i)
      days.push({ date: prevDate, inMonth: false })
    }

    // Giorni del mese corrente
    for (var d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(currentYear, currentMonth, d), inMonth: true })
    }

    // Giorni del mese successivo per completare la griglia
    var remaining = 7 - (days.length % 7)
    if (remaining < 7) {
      for (var j = 1; j <= remaining; j++) {
        days.push({ date: new Date(currentYear, currentMonth + 1, j), inMonth: false })
      }
    }

    return days
  }

  var calendarDays = getCalendarDays()
  var todayStr = formatDateISO(now.getFullYear(), now.getMonth() + 1, now.getDate())

  return (
    <div>
      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prenotazioni</h1>
        </div>
        <Link
          to="/prenotazioni/nuova"
          className="inline-flex items-center gap-2 bg-wine-700 text-white px-5 py-3 rounded-xl hover:bg-wine-800 transition-colors font-medium shadow-sm"
        >
          <Plus size={20} />
          <span>Nuova Prenotazione</span>
        </Link>
      </div>

      {/* Navigazione mese */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={function() { changeMonth(-1) }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="text-center">
            <p className="text-xl font-bold text-gray-900">
              {MONTH_NAMES[currentMonth] + ' ' + currentYear}
            </p>
            <button
              onClick={goToToday}
              className="text-sm text-wine-600 hover:text-wine-800 mt-1"
            >
              Vai a oggi
            </button>
          </div>

          <button
            onClick={function() { changeMonth(1) }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500 px-1">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-wine-200 inline-block"></span> Pranzo
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-wine-600 inline-block"></span> Cena
        </span>
        <span className="flex items-center gap-1">
          <Star size={12} className="text-amber-500" /> Evento confermato
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} className="text-blue-500" /> Opzione evento
        </span>
      </div>

      {/* Griglia calendario */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header giorni della settimana */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {DAY_NAMES.map(function(day) {
            return (
              <div key={day} className="py-2 text-center text-sm font-medium text-gray-500 border-r border-gray-100 last:border-r-0">
                {day}
              </div>
            )
          })}
        </div>

        {/* Righe del calendario */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-400">Caricamento calendario...</p>
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {calendarDays.map(function(dayObj, idx) {
              var d = dayObj.date
              var dateStr = formatDateISO(d.getFullYear(), d.getMonth() + 1, d.getDate())
              var isToday = dateStr === todayStr
              var inMonth = dayObj.inMonth

              var lunchKey = dateStr + '_lunch'
              var dinnerKey = dateStr + '_dinner'
              var lunchData = coverData[lunchKey]
              var dinnerData = coverData[dinnerKey]
              var dayEvents = eventData[dateStr] || []

              var hasData = lunchData || dinnerData || dayEvents.length > 0

              return (
                <div
                  key={idx}
                  onClick={function() {
                    if (inMonth) {
                      navigate("/prenotazioni/giorno/" + dateStr)
                    }
                  }}
                  className={
                    "border-b border-r border-gray-100 p-1 min-h-[100px] lg:min-h-[120px] transition-colors " +
                    (inMonth ? "cursor-pointer hover:bg-gray-50 " : "bg-gray-50 opacity-40 ") +
                    (isToday ? "ring-2 ring-inset ring-wine-500 " : "")
                  }
                >
                  {/* Numero giorno */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={
                      "text-sm font-medium " +
                      (isToday ? "bg-wine-700 text-white w-6 h-6 rounded-full flex items-center justify-center" : "") +
                      (inMonth ? " text-gray-900" : " text-gray-400")
                    }>
                      {d.getDate()}
                    </span>
                    {/* Indicatori eventi */}
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5">
                        {dayEvents.map(function(ev, evIdx) {
                          if (ev.event_type === 'confirmed') {
                            return <Star key={evIdx} size={12} className="text-amber-500 fill-amber-500" />
                          }
                          return <Clock key={evIdx} size={12} className="text-blue-500" />
                        })}
                      </div>
                    )}
                  </div>

                  {/* Dati pranzo */}
                  {lunchData && (
                    <div className="bg-wine-50 rounded px-1.5 py-0.5 mb-0.5">
                      <div className="text-xs font-semibold text-wine-800">
                        {lunchData.total + " Ospiti"}
                      </div>
                      <div className="text-xs text-wine-600">
                        {lunchData.adults + " Ad. " + lunchData.children + " Ba."}
                      </div>
                    </div>
                  )}

                  {/* Dati cena */}
                  {dinnerData && (
                    <div className="bg-wine-200 rounded px-1.5 py-0.5">
                      <div className="text-xs font-semibold text-wine-900">
                        {dinnerData.total + " Ospiti"}
                      </div>
                      <div className="text-xs text-wine-700">
                        {dinnerData.adults + " Ad. " + dinnerData.children + " Ba."}
                      </div>
                    </div>
                  )}

                  {/* Eventi */}
                  {dayEvents.map(function(ev, evIdx) {
                    var bgColor = ev.event_type === 'confirmed' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                    return (
                      <div key={evIdx} className={"rounded px-1.5 py-0.5 mt-0.5 text-xs font-medium truncate " + bgColor}>
                        {ev.title}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="h-8" />
    </div>
  )
}

export default ReservationCalendar
