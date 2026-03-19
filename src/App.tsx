/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { LyricEditor } from './components/Editor';
import { useStore, Project } from './store/useStore';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';

export default function App() {
  const { setUser, setProjects } = useStore();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      
      if (user) {
        // Fetch projects
        const q = query(
          collection(db, 'projects'),
          where('uid', '==', user.uid),
          orderBy('updatedAt', 'desc')
        );
        
        const unsubscribeProjects = onSnapshot(q, (snapshot) => {
          const projectsData: Project[] = [];
          snapshot.forEach((doc) => {
            projectsData.push({ id: doc.id, ...doc.data() } as Project);
          });
          setProjects(projectsData);
        });
        
        return () => unsubscribeProjects();
      } else {
        setProjects([]);
      }
    });

    return () => unsubscribeAuth();
  }, [setUser, setProjects]);

  return (
    <Layout>
      <LyricEditor />
    </Layout>
  );
}
