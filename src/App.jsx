import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

// UI Components
import { ConnectionStatus } from './components/ui/ConnectionStatus'

// Feature Components
import { ProjectCard } from './components/projects/ProjectCard'
import { ProjectDetail } from './components/projects/ProjectDetail'
import { ProjectAanmaakModal } from './components/projects/ProjectAanmaakModal'
import { KanbanBoard } from './components/kanban/KanbanBoard'
import { Tijdsregistratie } from './components/tijdsregistratie/Tijdsregistratie'
import { TransportRegistratie } from './components/transport/TransportRegistratie'
import { BibliotheekBeheer } from './components/bibliotheek/BibliotheekBeheer'
import { SjablonenBeheer } from './components/sjablonen/SjablonenBeheer'
import { PlanningWeek } from './components/planning/PlanningWeek'
import { PlanningTijdlijn } from './components/planning/PlanningTijdlijn'
import { PlanningInplannen } from './components/planning/PlanningInplannen'
import { PlanningSpoed } from './components/planning/PlanningSpoed'
import { WervenBeheer } from './components/werven/WervenBeheer'

// =====================================================
// MAIN APP
// =====================================================
export default function App() {
  const [view, setView] = useState('projecten')
  const [projecten, setProjecten] = useState([])
  const [bibliotheek, setBibliotheek] = useState([])
  const [sjablonen, setSjablonen] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [error, setError] = useState(null)

  const initialLoadDone = useRef(false)

  // Load all data — alleen loading spinner tonen bij eerste keer
  const loadData = useCallback(async () => {
    if (!initialLoadDone.current) setLoading(true)
    setError(null)
    try {
      console.log('Loading data from Supabase...')

      const { data: projectenData, error: pErr } = await supabase.from('projecten').select('*').order('created_at', { ascending: false })
      if (pErr) throw pErr
      console.log('Projecten loaded:', projectenData?.length)

      const { data: bibliotheekData, error: bErr } = await supabase.from('bibliotheek').select('*').order('naam')
      if (bErr) throw bErr
      console.log('Bibliotheek loaded:', bibliotheekData?.length)

      const { data: sjablonenData, error: sErr } = await supabase.from('sjablonen').select('*').order('naam')
      if (sErr) throw sErr
      console.log('Sjablonen loaded:', sjablonenData?.length)

      const { data: sjabloonItems } = await supabase.from('sjabloon_items').select('*')

      const { data: medewerkersData } = await supabase.from('medewerkers').select('*').eq('actief', true).order('volgorde').order('naam')

      const sjablonenMetItems = (sjablonenData || []).map(s => ({
        ...s,
        items: (sjabloonItems || []).filter(i => i.sjabloon_id === s.id)
      }))

      setProjecten(projectenData || [])
      setBibliotheek(bibliotheekData || [])
      setSjablonen(sjablonenMetItems)
      setMedewerkers(medewerkersData || [])
      setIsOnline(true)
      setLastSync(new Date().toISOString())
      initialLoadDone.current = true
      console.log('All data loaded successfully!')
    } catch (e) {
      console.error('Fout bij laden:', e)
      setIsOnline(false)
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projectZoek, setProjectZoek] = useState('')
  const [showInplannen, setShowInplannen] = useState(false)
  const [showSpoed, setShowSpoed] = useState(false)
  const [planningRefreshKey, setPlanningRefreshKey] = useState(0)

  const handlePlanningRefresh = () => setPlanningRefreshKey(k => k + 1)

  const handleNewProject = (created) => {
    setProjecten([created, ...projecten])
    setSelectedProject(created)
  }

  const updateProject = (updatedProject) => {
    setProjecten(projecten.map(p => p.id === updatedProject.id ? updatedProject : p))
    setSelectedProject(updatedProject)
  }

  const deleteProject = async (projectId) => {
    if (!confirm('Weet je zeker dat je dit project wilt verwijderen? Alle orders worden ook verwijderd.')) return
    try {
      await supabase.from('projecten').delete().eq('id', projectId)
      setProjecten(projecten.filter(p => p.id !== projectId))
      setSelectedProject(null)
    } catch (e) {
      alert('Fout bij verwijderen: ' + e.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verbinden met database...</p>
          {error && (
            <div className="mt-4 p-4 bg-red-100 border border-red-300 rounded-lg text-red-700 max-w-md">
              <p className="font-medium">Fout bij verbinden:</p>
              <p className="text-sm mt-1">{error}</p>
              <button onClick={() => { setError(null); loadData() }} className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
                Opnieuw proberen
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="mx-auto px-6 py-3 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">🪑 Projectbeheer</h1>
            <nav className="flex flex-wrap gap-1">
              {[
                { id: 'projecten', icon: '📁', label: 'Projecten' },
                { id: 'kanban', icon: '📋', label: 'Kanban' },
                { id: 'planning', icon: '📅', label: 'Planning' },
                { id: 'tijdlijn', icon: '📊', label: 'Tijdlijn' },
                { id: 'tijdsregistratie', icon: '⏱️', label: 'Uren' },
                { id: 'transport', icon: '🚚', label: 'Transport' },
                { id: 'bibliotheek', icon: '📚', label: 'Bibliotheek' },
                { id: 'sjablonen', icon: '📋', label: 'Sjablonen' },
                { id: 'werven', icon: '🏗️', label: 'Werven' }
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => {
                    setView(v.id)
                    if (v.id !== 'projecten') setSelectedProject(null)
                    if (v.id === 'projecten') loadData()
                  }}
                  className={`px-3 py-1.5 rounded text-sm ${view === v.id && !selectedProject ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {v.icon} <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
              {selectedProject && (
                <span className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-green-100 text-green-700">
                  🔧 <span className="hidden sm:inline">{selectedProject.naam || selectedProject.project_nummer}</span>
                </span>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <ConnectionStatus isOnline={isOnline} lastSync={lastSync} />
            <button onClick={loadData} className="px-3 py-1.5 bg-gray-200 rounded text-sm hover:bg-gray-300">🔄</button>
          </div>
        </div>
      </header>

      <main className={`mx-auto px-6 py-6 ${(view === 'kanban' || view === 'planning' || view === 'tijdlijn' || view === 'werven') && !selectedProject ? 'max-w-full' : 'max-w-[1600px]'}`}>
        {selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            bibliotheek={bibliotheek}
            sjablonen={sjablonen}
            medewerkers={medewerkers}
            onBack={() => { setSelectedProject(null); loadData() }}
            onRefresh={loadData}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
          />
        ) : (
          <>
            {view === 'projecten' && (() => {
              const zoek = projectZoek.toLowerCase()
              const gefilterd = projecten.filter(p => {
                if (!zoek) return true
                return (p.naam || '').toLowerCase().includes(zoek) ||
                       (p.klant || '').toLowerCase().includes(zoek) ||
                       (p.project_nummer || '').toLowerCase().includes(zoek)
              })
              const actieveProjecten = gefilterd.filter(p => p.actief !== false)
              const nonActieveProjecten = gefilterd.filter(p => p.actief === false)
              return (
                <div>
                  <div className="flex gap-3 mb-6 items-center">
                    <input
                      type="text"
                      value={projectZoek}
                      onChange={(e) => setProjectZoek(e.target.value)}
                      placeholder="🔍 Zoek project, klant of nummer..."
                      className="flex-1 border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <button onClick={() => setShowProjectModal(true)} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium whitespace-nowrap">+ Nieuw Project</button>
                  </div>

                  {/* Actieve projecten */}
                  {actieveProjecten.length > 0 && (
                    <>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Actief ({actieveProjecten.length})</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                        {actieveProjecten.map(p => <ProjectCard key={p.id} project={p} onClick={() => setSelectedProject(p)} onToggleActief={loadData} />)}
                      </div>
                    </>
                  )}

                  {/* Non-actieve projecten */}
                  {nonActieveProjecten.length > 0 && (
                    <>
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Non-actief ({nonActieveProjecten.length})</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {nonActieveProjecten.map(p => <ProjectCard key={p.id} project={p} onClick={() => setSelectedProject(p)} onToggleActief={loadData} />)}
                      </div>
                    </>
                  )}

                  {projecten.length === 0 && <div className="text-center py-12 text-gray-500">Nog geen projecten. Maak je eerste project aan!</div>}
                  {projecten.length > 0 && gefilterd.length === 0 && <div className="text-center py-12 text-gray-400">Geen projecten gevonden voor "{projectZoek}"</div>}
                </div>
              )
            })()}
            {view === 'kanban' && <KanbanBoard projecten={projecten} />}
            {view === 'planning' && (
              <PlanningWeek
                key={planningRefreshKey}
                projecten={projecten}
                medewerkers={medewerkers}
                onOpenInplannen={() => setShowInplannen(true)}
                onOpenSpoed={() => setShowSpoed(true)}
                onMedewerkerVolgorde={loadData}
              />
            )}
            {view === 'tijdlijn' && (
              <PlanningTijdlijn
                key={planningRefreshKey}
                projecten={projecten}
                medewerkers={medewerkers}
              />
            )}
            {view === 'tijdsregistratie' && <Tijdsregistratie projecten={projecten} medewerkers={medewerkers} onRefresh={loadData} />}
            {view === 'transport' && <TransportRegistratie projecten={projecten} />}
            {view === 'bibliotheek' && <BibliotheekBeheer bibliotheek={bibliotheek} onRefresh={loadData} />}
            {view === 'sjablonen' && <SjablonenBeheer sjablonen={sjablonen} bibliotheek={bibliotheek} onRefresh={loadData} />}
            {view === 'werven' && <WervenBeheer />}
          </>
        )}
      </main>

      {showProjectModal && (
        <ProjectAanmaakModal
          onClose={() => setShowProjectModal(false)}
          onCreate={handleNewProject}
        />
      )}

      {showInplannen && (
        <PlanningInplannen
          projecten={projecten}
          medewerkers={medewerkers}
          onClose={() => setShowInplannen(false)}
          onGepland={handlePlanningRefresh}
        />
      )}

      {showSpoed && (
        <PlanningSpoed
          projecten={projecten}
          medewerkers={medewerkers}
          onClose={() => setShowSpoed(false)}
          onGepland={handlePlanningRefresh}
        />
      )}
    </div>
  )
}
