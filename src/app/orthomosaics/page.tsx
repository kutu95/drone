'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { OrthomosaicProject, fetchOrthomosaicProjects, deleteOrthomosaicProject } from '@/lib/supabase';
import Link from 'next/link';

export default function OrthomosaicsPage() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<OrthomosaicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        loadProjects();
      }
    }
  }, [user, authLoading, router]);

  const loadProjects = async () => {
    try {
      const data = await fetchOrthomosaicProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load orthomosaic projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this orthomosaic project?')) return;
    
    try {
      await deleteOrthomosaicProject(id);
      setProjects(projects.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleSignOut = async () => {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Loading...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold">DJI Air 3 Mission Planner</h1>
            <div className="flex gap-4 items-center">
              <Link
                href="/missions"
                className="text-gray-600 hover:text-gray-800"
              >
                Missions
              </Link>
              <Link
                href="/logs"
                className="text-gray-600 hover:text-gray-800"
              >
                Flight Logs
              </Link>
              <Link
                href="/photos"
                className="text-gray-600 hover:text-gray-800"
              >
                Photo Search
              </Link>
              <Link
                href="/batteries"
                className="text-gray-600 hover:text-gray-800"
              >
                Batteries
              </Link>
              <Link
                href="/fleet"
                className="text-gray-600 hover:text-gray-800"
              >
                Fleet
              </Link>
              <button
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-800"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">Orthomosaic Projects</h2>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">No orthomosaic projects yet.</p>
            <p className="text-sm text-gray-500 mb-4">
              To create an orthomosaic:
            </p>
            <ol className="text-sm text-gray-500 text-left max-w-md mx-auto space-y-2 mb-6">
              <li>1. Create a mapping mission and fly it</li>
              <li>2. Upload the flight log with photos</li>
              <li>3. Process the flight log to generate the orthomosaic</li>
            </ol>
            <Link
              href="/missions/mapping/new"
              className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Create Mapping Mission
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div key={project.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold">{project.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </div>
                
                {project.description && (
                  <p className="text-gray-600 text-sm mb-4">{project.description}</p>
                )}

                <div className="space-y-2 text-sm">
                  {project.photoCount && (
                    <div>
                      <span className="text-gray-500">Photos:</span>
                      <span className="ml-2 font-medium">{project.photoCount}</span>
                    </div>
                  )}
                  
                  {project.area && (
                    <div>
                      <span className="text-gray-500">Area:</span>
                      <span className="ml-2 font-medium">
                        {((project.area.north - project.area.south) * 111000).toFixed(0)}m ×{' '}
                        {((project.area.east - project.area.west) * 111000 * 
                          Math.cos((project.area.north + project.area.south) / 2 * Math.PI / 180)).toFixed(0)}m
                      </span>
                    </div>
                  )}

                  {project.processingCompletedAt && (
                    <div>
                      <span className="text-gray-500">Completed:</span>
                      <span className="ml-2 font-medium">
                        {new Date(project.processingCompletedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  {project.processingError && (
                    <div className="text-red-600 text-xs">
                      Error: {project.processingError}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  {project.status === 'completed' && project.orthomosaicUrl && (
                    <Link
                      href={`/orthomosaics/${project.id}`}
                      className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm text-center hover:bg-blue-700"
                    >
                      View Orthomosaic
                    </Link>
                  )}
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="px-3 py-2 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

