import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface Conversation {
  id: string;
  start_time: Date;
  end_time: Date;
  state: string;
  summary: string;
  atmosphere: string;
  key_takeaways: string[];
  action_items: string[];
  raw_content: string;
  detailed_content?: ConversationDetail;
}

interface ConversationDetail {
  id: string;
  timezone: string;
  start_time: Date;
  end_time: Date;
  device_type: string;
  state: string;
  created_at: Date;
  updated_at: Date;
  short_summary: string;
  summary: string;
  atmosphere: string;
  key_takeaways: string[];
  action_items: string[];
  primary_location: string;
  suggested_links: string[];
  utterances: Utterance[];
}

interface Utterance {
  speaker: string;
  text: string;
  spoken_at: Date;
  start: number;
  end: number;
}

class BeeConversationsDetailFetcher {
  private readonly inputDir: string;
  private readonly outputDir: string;
  private readonly startDate: Date;
  private readonly endDate: Date;
  private filteredConversations: Conversation[] = [];

  constructor(startDate: string, endDate: string) {
    this.inputDir = path.join(process.cwd(), 'conversaciones_descargadas');
    this.outputDir = path.join(process.cwd(), 'conversaciones_por_dia');

    // Rango de fechas dinamico (lo pasa el pipeline/cron).
    this.startDate = new Date(`${startDate}T00:00:00`);
    this.endDate = new Date(`${endDate}T23:59:59`);
  }

  async initialize() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      await fs.access(this.inputDir);
      
      console.log('📁 SISTEMA DE CONVERSACIONES POR DÍA');
      console.log('='.repeat(50));
      console.log(`📁 Directorio de entrada: ${this.inputDir}`);
      console.log(`📁 Directorio de salida: ${this.outputDir}`);
      console.log(`📅 Rango de fechas: ${this.startDate.toLocaleDateString()} - ${this.endDate.toLocaleDateString()}`);
      console.log('📄 Formato: Un archivo por día (no archivos individuales)');
    } catch (error) {
      console.error('❌ Error: No se encuentra el directorio de conversaciones descargadas');
      console.error('   Ejecuta primero el script de descarga');
      process.exit(1);
    }
  }

  async loadAndFilterConversations() {
    console.log('\n🔍 Cargando conversaciones descargadas...');
    
    try {
      const jsonPath = path.join(this.inputDir, 'conversaciones_filtradas.json');
      const jsonContent = await fs.readFile(jsonPath, 'utf-8');
      const allConversations: Conversation[] = JSON.parse(jsonContent);
      
      console.log(`📊 Total conversaciones en archivo: ${allConversations.length}`);
      
      this.filteredConversations = allConversations.filter(conv => {
        const convDate = new Date(conv.start_time);
        return convDate >= this.startDate && convDate <= this.endDate;
      });
      
      console.log(`✅ Conversaciones en rango de fechas: ${this.filteredConversations.length}`);
      
      if (this.filteredConversations.length === 0) {
        console.log('⚠️ No hay conversaciones en el rango de fechas especificado');
        process.exit(0);
      }
      
      // Mostrar distribución por día
      const byDay: Record<string, number> = {};
      this.filteredConversations.forEach(conv => {
        const day = new Date(conv.start_time).toISOString().split('T')[0];
        byDay[day] = (byDay[day] || 0) + 1;
      });
      
      console.log('\n📅 Distribución por día:');
      Object.entries(byDay).forEach(([day, count]) => {
        console.log(`   • ${day}: ${count} conversaciones`);
      });
      
      return this.filteredConversations;
      
    } catch (error) {
      console.error('❌ Error cargando conversaciones:', error);
      throw error;
    }
  }

  private parseConversationDetail(rawContent: string, conversationId: string): ConversationDetail | null {
    try {
      const lines = rawContent.split('\n');
      const detail: Partial<ConversationDetail> = {
        id: conversationId,
        utterances: []
      };

      let currentSection = '';
      let currentUtterance: Partial<Utterance> | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Parsear metadatos iniciales
        if (line.startsWith('- timezone:')) {
          detail.timezone = line.replace('- timezone:', '').trim();
        } else if (line.startsWith('- start_time:')) {
          const match = line.match(/- start_time:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          if (match) detail.start_time = new Date(match[1].replace(' ', 'T') + ':00');
        } else if (line.startsWith('- end_time:')) {
          const match = line.match(/- end_time:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          if (match) detail.end_time = new Date(match[1].replace(' ', 'T') + ':00');
        } else if (line.startsWith('- device_type:')) {
          detail.device_type = line.replace('- device_type:', '').trim();
        } else if (line.startsWith('- state:')) {
          detail.state = line.replace('- state:', '').trim();
        } else if (line.startsWith('- created_at:')) {
          const match = line.match(/- created_at:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          if (match) detail.created_at = new Date(match[1].replace(' ', 'T') + ':00');
        } else if (line.startsWith('- updated_at:')) {
          const match = line.match(/- updated_at:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          if (match) detail.updated_at = new Date(match[1].replace(' ', 'T') + ':00');
        }
        
        // Detectar secciones
        if (line === '## Short Summary') {
          currentSection = 'short_summary';
          continue;
        } else if (line === '## Summary') {
          currentSection = 'summary';
          continue;
        } else if (line === '## Atmosphere') {
          currentSection = 'atmosphere';
          continue;
        } else if (line === '## Key Take aways') {
          currentSection = 'key_takeaways';
          detail.key_takeaways = [];
          continue;
        } else if (line === '## Action Items') {
          currentSection = 'action_items';
          detail.action_items = [];
          continue;
        } else if (line === '## Primary Location') {
          currentSection = 'primary_location';
          continue;
        } else if (line === '## Suggested Links') {
          currentSection = 'suggested_links';
          detail.suggested_links = [];
          continue;
        } else if (line === '## Utterances') {
          currentSection = 'utterances';
          continue;
        }

        // Procesar contenido según la sección
        if (currentSection === 'short_summary' && line && !line.startsWith('##')) {
          detail.short_summary = (detail.short_summary || '') + line + ' ';
        } else if (currentSection === 'summary' && line && !line.startsWith('##')) {
          detail.summary = (detail.summary || '') + line + ' ';
        } else if (currentSection === 'atmosphere' && line && !line.startsWith('##')) {
          detail.atmosphere = (detail.atmosphere || '') + line + ' ';
        } else if (currentSection === 'key_takeaways' && line.startsWith('-')) {
          detail.key_takeaways?.push(line.substring(1).trim());
        } else if (currentSection === 'action_items' && line.startsWith('-')) {
          detail.action_items?.push(line.substring(1).trim());
        } else if (currentSection === 'primary_location' && line && !line.startsWith('##') && line !== '(none)') {
          detail.primary_location = line;
        } else if (currentSection === 'suggested_links' && line && !line.startsWith('##') && line !== '(none)') {
          detail.suggested_links?.push(line);
        } else if (currentSection === 'utterances') {
          const utteranceMatch = line.match(/- ([^:]+):\s*(.+?)\s*\(spoken_at:\s*(.+?),\s*start:\s*(\d+),\s*end:\s*(\d+)\)/);
          if (utteranceMatch) {
            if (currentUtterance) {
              detail.utterances?.push(currentUtterance as Utterance);
            }
            currentUtterance = {
              speaker: utteranceMatch[1].trim(),
              text: utteranceMatch[2].trim(),
              spoken_at: new Date(utteranceMatch[3]),
              start: parseInt(utteranceMatch[4]),
              end: parseInt(utteranceMatch[5])
            };
          } else if (currentUtterance && line && !line.startsWith('-')) {
            currentUtterance.text += ' ' + line.trim();
          }
        }
      }

      if (currentUtterance) {
        detail.utterances?.push(currentUtterance as Utterance);
      }

      if (detail.short_summary) detail.short_summary = detail.short_summary.trim();
      if (detail.summary) detail.summary = detail.summary.trim();
      if (detail.atmosphere) detail.atmosphere = detail.atmosphere.trim();

      return detail as ConversationDetail;
      
    } catch (error) {
      console.error(`❌ Error parseando detalle de conversación ${conversationId}:`, error);
      return null;
    }
  }

  async fetchAndGroupByDay() {
    console.log('\n🚀 Obteniendo detalles y agrupando por día...');
    
    // Estructura para guardar conversaciones por día
    const conversationsByDay: Record<string, Conversation[]> = {};
    
    // Inicializar estructura por día
    this.filteredConversations.forEach(conv => {
      const day = new Date(conv.start_time).toISOString().split('T')[0];
      if (!conversationsByDay[day]) {
        conversationsByDay[day] = [];
      }
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < this.filteredConversations.length; i++) {
      const conv = this.filteredConversations[i];
      const day = new Date(conv.start_time).toISOString().split('T')[0];
      
      console.log(`\n[${i + 1}/${this.filteredConversations.length}] Procesando conversación ${conv.id} (${day})...`);
      
      try {
        // Intentar obtener el detalle
        console.log(`   🔄 Obteniendo detalle...`);
        const command = `bee conversations get ${conv.id}`;
        const { stdout, stderr } = await execAsync(command);
        
        if (stderr) {
          console.warn(`   ⚠️  Advertencia:`, stderr);
        }
        
        // Parsear el detalle
        const detail = this.parseConversationDetail(stdout, conv.id);
        
        if (detail) {
          conv.detailed_content = detail;
          conversationsByDay[day].push(conv);
          successCount++;
          console.log(`   ✅ Detalle procesado (${detail.utterances?.length || 0} utterances)`);
        } else {
          // Si no se pudo parsear, guardar sin detalle
          conversationsByDay[day].push(conv);
          errorCount++;
          console.log(`   ⚠️  Se guardará sin detalle estructurado`);
        }
        
        // Pequeña pausa para no sobrecargar
        await this.sleep(500);
        
      } catch (error) {
        console.error(`   ❌ Error:`, error);
        // Guardar sin detalle en caso de error
        conversationsByDay[day].push(conv);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Resumen:`);
    console.log(`   • Exitosos: ${successCount}`);
    console.log(`   • Fallidos: ${errorCount}`);
    
    return conversationsByDay;
  }

  async generateDailyFiles(conversationsByDay: Record<string, Conversation[]>) {
    console.log('\n📝 Generando archivos por día...');
    
    const days = Object.keys(conversationsByDay).sort();
    
    for (const day of days) {
      const conversations = conversationsByDay[day];
      console.log(`\n   Procesando día ${day} (${conversations.length} conversaciones)...`);
      
      // Ordenar conversaciones por hora
      conversations.sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
      
      // Generar archivo de resumen del día (TXT)
      await this.generateDaySummaryFile(day, conversations);
      
      // Generar archivo JSON del día con todos los detalles
      await this.generateDayJsonFile(day, conversations);
      
      // Generar archivo de utterances del día
      await this.generateDayUtterancesFile(day, conversations);
    }
    
    // Generar archivo de resumen global
    await this.generateGlobalSummary(conversationsByDay);
  }

  private async generateDaySummaryFile(day: string, conversations: Conversation[]) {
    const filename = path.join(this.outputDir, `${day}_resumen.txt`);
    
    let content = `📅 CONVERSACIONES DEL DÍA ${day}\n`;
    content += `📊 Total: ${conversations.length} conversaciones\n`;
    content += '='.repeat(100) + '\n\n';
    
    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      content += `【${i + 1}】 CONVERSACIÓN ${conv.id}\n`;
      content += `${'─'.repeat(80)}\n`;
      content += `🕐 Horario: ${new Date(conv.start_time).toLocaleTimeString()} - ${new Date(conv.end_time).toLocaleTimeString()}\n`;
      content += `⏱️ Duración: ${this.calculateDuration(conv.start_time, conv.end_time)}\n`;
      content += `📊 Estado: ${conv.state}\n\n`;
      
      if (conv.detailed_content) {
        const d = conv.detailed_content;
        content += `📋 RESUMEN CORTO:\n${d.short_summary || 'N/A'}\n\n`;
        content += `📋 RESUMEN COMPLETO:\n${d.summary || conv.summary}\n\n`;
        content += `🌍 ATMÓSFERA:\n${d.atmosphere || conv.atmosphere}\n\n`;
        
        content += `🎯 PUNTOS CLAVE:\n`;
        (d.key_takeaways || conv.key_takeaways).forEach(k => content += `   • ${k}\n`);
        content += '\n';
        
        content += `✅ ACCIONES:\n`;
        (d.action_items || conv.action_items).forEach(a => content += `   • ${a}\n`);
        content += '\n';
        
        // Mostrar muestra de utterances (primeros 3)
        if (d.utterances && d.utterances.length > 0) {
          content += `💬 MUESTRA DE CONVERSACIÓN (${d.utterances.length} intervenciones totales):\n`;
          const sampleSize = Math.min(3, d.utterances.length);
          for (let j = 0; j < sampleSize; j++) {
            const u = d.utterances[j];
            content += `   🗣️ ${u.speaker}: ${u.text.substring(0, 150)}${u.text.length > 150 ? '...' : ''}\n`;
          }
          if (d.utterances.length > 3) {
            content += `   ... y ${d.utterances.length - 3} intervenciones más\n`;
          }
          content += '\n';
        }
      } else {
        content += `📋 RESUMEN:\n${conv.summary}\n\n`;
        content += `🌍 ATMÓSFERA:\n${conv.atmosphere}\n\n`;
        content += `🎯 PUNTOS CLAVE:\n${conv.key_takeaways.map(k => `   • ${k}`).join('\n')}\n\n`;
        content += `✅ ACCIONES:\n${conv.action_items.map(a => `   • ${a}`).join('\n')}\n\n`;
        content += `⚠️ Detalle completo no disponible\n\n`;
      }
      
      content += '='.repeat(100) + '\n\n';
    }
    
    await fs.writeFile(filename, content, 'utf-8');
    console.log(`      ✅ ${day}_resumen.txt generado`);
  }

  private async generateDayJsonFile(day: string, conversations: Conversation[]) {
    const filename = path.join(this.outputDir, `${day}_completo.json`);
    
    // Preparar datos para JSON (manejar fechas)
    const jsonData = conversations.map(conv => ({
      ...conv,
      start_time: conv.start_time,
      end_time: conv.end_time,
      detailed_content: conv.detailed_content ? {
        ...conv.detailed_content,
        start_time: conv.detailed_content.start_time,
        end_time: conv.detailed_content.end_time,
        created_at: conv.detailed_content.created_at,
        updated_at: conv.detailed_content.updated_at,
        utterances: conv.detailed_content.utterances?.map(u => ({
          ...u,
          spoken_at: u.spoken_at
        }))
      } : undefined
    }));
    
    await fs.writeFile(filename, JSON.stringify(jsonData, this.replacer, 2), 'utf-8');
    console.log(`      ✅ ${day}_completo.json generado`);
  }

  private async generateDayUtterancesFile(day: string, conversations: Conversation[]) {
    const filename = path.join(this.outputDir, `${day}_conversaciones_completas.txt`);
    
    let content = `📅 TRANSCRIPCIONES COMPLETAS DEL DÍA ${day}\n`;
    content += `📊 Total: ${conversations.length} conversaciones\n`;
    content += '='.repeat(100) + '\n\n';
    
    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      
      content += `【${i + 1}】 CONVERSACIÓN ${conv.id}\n`;
      content += `🕐 ${new Date(conv.start_time).toLocaleTimeString()} - ${new Date(conv.end_time).toLocaleTimeString()}\n`;
      content += `${'─'.repeat(80)}\n\n`;
      
      if (conv.detailed_content?.utterances && conv.detailed_content.utterances.length > 0) {
        conv.detailed_content.utterances.forEach((u, index) => {
          const timeStr = u.spoken_at ? new Date(u.spoken_at).toLocaleTimeString() : 'N/A';
          content += `[${index + 1}] ${timeStr} - 🗣️ ${u.speaker}:\n`;
          content += `${u.text}\n`;
          if (index < conv.detailed_content!.utterances!.length - 1) content += '\n';
        });
      } else {
        content += `No hay transcripción disponible para esta conversación.\n`;
      }
      
      content += '\n' + '='.repeat(100) + '\n\n';
    }
    
    await fs.writeFile(filename, content, 'utf-8');
    console.log(`      ✅ ${day}_conversaciones_completas.txt generado`);
  }

  private async generateGlobalSummary(conversationsByDay: Record<string, Conversation[]>) {
    const filename = path.join(this.outputDir, 'resumen_general.txt');
    
    let content = `📊 RESUMEN GENERAL - PERÍODO ${this.startDate.toLocaleDateString()} AL ${this.endDate.toLocaleDateString()}\n`;
    content += '='.repeat(100) + '\n\n';
    
    const days = Object.keys(conversationsByDay).sort();
    let totalConversaciones = 0;
    let totalUtterances = 0;
    let totalAcciones = 0;
    
    for (const day of days) {
      const conversations = conversationsByDay[day];
      totalConversaciones += conversations.length;
      
      let dayUtterances = 0;
      let dayAcciones = 0;
      
      conversations.forEach(conv => {
        dayAcciones += conv.action_items.length;
        if (conv.detailed_content?.utterances) {
          dayUtterances += conv.detailed_content.utterances.length;
        }
      });
      
      totalUtterances += dayUtterances;
      totalAcciones += dayAcciones;
      
      content += `📅 ${day}\n`;
      content += `   • Conversaciones: ${conversations.length}\n`;
      content += `   • Intervenciones totales: ${dayUtterances}\n`;
      content += `   • Acciones identificadas: ${dayAcciones}\n`;
      content += `   • Archivos generados:\n`;
      content += `     - ${day}_resumen.txt\n`;
      content += `     - ${day}_completo.json\n`;
      content += `     - ${day}_conversaciones_completas.txt\n\n`;
    }
    
    content += '='.repeat(100) + '\n';
    content += `📈 TOTALES DEL PERÍODO:\n`;
    content += `   • Días: ${days.length}\n`;
    content += `   • Conversaciones: ${totalConversaciones}\n`;
    content += `   • Intervenciones: ${totalUtterances}\n`;
    content += `   • Acciones: ${totalAcciones}\n`;
    content += `   • Promedio intervenciones por conversación: ${(totalUtterances / totalConversaciones).toFixed(1)}\n`;
    content += `   • Promedio acciones por conversación: ${(totalAcciones / totalConversaciones).toFixed(1)}\n`;
    
    await fs.writeFile(filename, content, 'utf-8');
    console.log(`\n   ✅ resumen_general.txt generado`);
  }

  private replacer(key: string, value: any): any {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }

  private calculateDuration(start: string | Date, end: string | Date): string {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const durationMin = (endTime - startTime) / (1000 * 60);
    
    if (durationMin < 60) {
      return `${Math.round(durationMin)} minutos`;
    } else {
      const hours = Math.floor(durationMin / 60);
      const minutes = Math.round(durationMin % 60);
      return `${hours}h ${minutes}m`;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Descarga el detalle (utterances) y genera los archivos por dia para un
 * rango de fechas (YYYY-MM-DD). Exportada para el pipeline/cron.
 */
export async function downloadDetailByDay(
  startDate: string,
  endDate: string,
): Promise<void> {
  const fetcher = new BeeConversationsDetailFetcher(startDate, endDate);
  await fetcher.initialize();
  await fetcher.loadAndFilterConversations();
  const conversationsByDay = await fetcher.fetchAndGroupByDay();
  await fetcher.generateDailyFiles(conversationsByDay);
  console.log('✅ Detalle por dia generado.');
}

// Ejecucion directa: por defecto los ultimos 3 dias.
if (require.main === module) {
  const hoy = new Date();
  const ini = new Date(hoy.getTime() - 3 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  downloadDetailByDay(fmt(ini), fmt(hoy)).catch((e) => {
    console.error('❌ Error:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}