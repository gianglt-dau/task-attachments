import express from 'express';
import { getSupabaseAdmin, STORAGE_BUCKET } from '../lib/supabase.js';
import { TaskStatus } from '../types.js';

export const listTasks = async (req: express.Request, res: express.Response) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const createTask = async (req: express.Request, res: express.Response) => {
  try {
    const { title, description } = req.body;
    const file = (req as any).file;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    
    // 1. Insert task
    const { data: task, error: insertError } = await supabaseAdmin
      .from('tasks')
      .insert([{ title, description, status: 'open' }])
      .select()
      .single();

    if (insertError) throw insertError;

    // 2. Handle file if present
    if (file) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      let contentType = file.mimetype;
      if (contentType.startsWith('text/') || contentType === 'application/json') {
        if (!contentType.includes('charset')) contentType += '; charset=utf-8';
      }

      const storagePath = `${task.id}/${Date.now()}-${file.originalname}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file.buffer, { contentType, upsert: true });

      if (!uploadError) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        
        const { data: updatedTask } = await supabaseAdmin
          .from('tasks')
          .update({ attachment_url: publicUrl, attachment_name: originalName })
          .eq('id', task.id)
          .select()
          .single();
        
        return res.status(201).json(updatedTask);
      }
    }

    res.status(201).json(task);
  } catch (error: any) {
    console.error('Create task error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteAttachment = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Get task data
    const { data: task, error: fetchError } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;
    if (!task.attachment_url) return res.status(400).json({ error: 'No attachment to delete' });

    // 2. Parse storage path from URL
    // Public URL format: .../storage/v1/object/public/bucket-name/folder/filename
    const baseUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const storagePath = task.attachment_url.replace(baseUrl, '');

    // 3. Delete from storage
    const { error: storageError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);
    
    if (storageError) throw storageError;

    // 4. Update DB
    const { data: updatedTask, error: dbError } = await supabaseAdmin
      .from('tasks')
      .update({ attachment_url: null, attachment_name: null })
      .eq('id', id)
      .select()
      .single();
    
    if (dbError) throw dbError;

    res.json(updatedTask);
  } catch (error: any) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateTaskStatus = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses: TaskStatus[] = ['open', 'in_progress', 'done'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Update status error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const uploadAttachment = async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fix Vietnamese encoding for filename from multer (latin1 to utf8)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    // Enrich content type for text files to support Vietnamese encoding in browsers
    let contentType = file.mimetype;
    if (contentType.startsWith('text/') || contentType === 'application/json') {
      if (!contentType.includes('charset')) {
        contentType += '; charset=utf-8';
      }
    }

    // 1. Upload to Supabase Storage
    // Use originalName for the database display but a safe path for storage
    const storagePath = `${id}/${Date.now()}-${file.originalname}`; 
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: contentType,
        upsert: true
      });

    if (uploadError) throw uploadError;

    // 2. Get Public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    // 3. Update Task in DB
    const { data: taskData, error: dbError } = await supabaseAdmin
      .from('tasks')
      .update({
        attachment_url: publicUrl,
        attachment_name: originalName, // Use fixed UTF-8 name here
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (dbError) throw dbError;

    res.json(taskData);
  } catch (error: any) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ error: error.message });
  }
};
