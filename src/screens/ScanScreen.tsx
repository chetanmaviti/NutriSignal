import React, { useState } from 'react';
import { View, Button, Image, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import axios from 'axios';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useAuth } from '../context/AuthContext';

export default function ScanScreen() {
  const [photo, setPhoto] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const { recordScan } = useAuth();

  const takePhoto = async () => {
    const res = await launchCamera({ mediaType: 'photo', quality: 0.8 });
    if (res.assets && res.assets[0]) {
      setPhoto(res.assets[0]);
      setResult(null);
      setExpanded(false);
    }
  };

  const chooseFromLibrary = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (res.assets && res.assets[0]) {
      setPhoto(res.assets[0]);
      setResult(null);
      setExpanded(false);
    }
  };

  const classifyPhoto = async () => {
    if (!photo) return;

    const formData = new FormData();
    formData.append('file', { uri: photo.uri, name: 'photo.jpg', type: 'image/jpeg' });

    try {
      const response = await axios.post('http://127.0.0.1:8000/classify', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
      setExpanded(false);
    } catch (err) {
      setResult({ error: 'Could not connect to backend.' });
    }
  };

  const saveScanResult = async () => {
    if (!result || result.error) {
      Alert.alert('Error', 'Cannot save invalid result');
      return;
    }

    try {
      setSaving(true);
      await recordScan(result.label, result.signal, result.score, result.nutrition);
      Alert.alert('Success', 'Scan saved to your history!');
      setPhoto(null);
      setResult(null);
    } catch (err) {
      Alert.alert('Error', 'Failed to save scan');
    } finally {
      setSaving(false);
    }
  };

  const renderNutrient = (label: string, value: any, unit: string) => (
    <View style={styles.nutrientRow} key={label}>
      <Text style={styles.nutrientLabel}>{label}</Text>
      <Text style={styles.nutrientValue}>
        {value !== undefined && value !== null ? `${typeof value === 'number' ? value.toFixed(2) : value} ${unit}` : '-'}
      </Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[styles.container, photo && { paddingVertical: 15, justifyContent: 'flex-start' }]}>
      <Text style={[styles.title, photo && { marginBottom: 10, opacity: 0 }]}>NutriSignal</Text>
      
      <View style={styles.buttonContainer}>
        <Button title="📸 Take Photo" onPress={takePhoto} disabled={saving} />
        <View style={{ height: photo ? 5 : 10 }} />
        <Button title="🖼️ Choose from Gallery" onPress={chooseFromLibrary} disabled={saving} />
      </View>

      {photo && <Image source={{ uri: photo.uri }} style={styles.image} />}
      
      <View style={{ marginVertical: photo ? 10 : 20 }}>
        <Button title="Classify" onPress={classifyPhoto} disabled={saving} />
      </View>

      {result && (
        <View style={styles.resultContainer}>
          {result.error ? (
            <Text style={styles.errorText}>{result.error}</Text>
          ) : (
            <View>
              <View style={styles.resultContent}>
                <View style={styles.circleColumn}>
                  <Text style={styles.bigCircle}>
                    {result.signal === "Green" ? "🟢" : result.signal === "Yellow" ? "🟡" : "🔴"}
                  </Text>
                </View>
                <View style={styles.infoColumn}>
                  <Text style={styles.label}>{result.label}</Text>
                  <Text style={styles.score}>{result.score?.toFixed(1) ?? 0} / 100</Text>
                </View>
              </View>

              {result.nutrition && (
                <View style={styles.nutrientContainer}>
                  <TouchableOpacity style={styles.accordionHeader} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
                    <Text style={styles.nutrientHeader}>Nutrition Facts (per 100g)</Text>
                    <Text style={styles.arrow}>{expanded ? "▲" : "▼"}</Text>
                  </TouchableOpacity>

                  {expanded && (
                    <View style={{ marginTop: 5 }}>
                      {renderNutrient("Calories", result.nutrition.calories, "kcal")}
                      {renderNutrient("Protein", result.nutrition.protein, "g")}
                      {renderNutrient("Carbs", result.nutrition.carbohydrates, "g")} 
                      {renderNutrient("Total Fat", result.nutrition.fat, "g")}
                      {renderNutrient("Sat. Fat", result.nutrition.saturated_fat, "g")}
                      {renderNutrient("Sugars", result.nutrition.sugar, "g")}
                      {renderNutrient("Fiber", result.nutrition.fiber, "g")}
                      {renderNutrient("Sodium", result.nutrition.sodium, "mg")}
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={saveScanResult} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>💾 Save Scan</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    marginBottom: 20,
  },
  buttonContainer: {
    width: '80%',
  },
  image: {
    width: '90%',
    height: 425,
    marginVertical: 10,
    borderRadius: 15,
    resizeMode: 'cover',
  },
  resultContainer: {
    marginTop: 0,
    paddingHorizontal: 20,
    width: '100%',
  },
  resultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    borderRadius: 15,
    padding: 15,
    marginBottom: 10,
  },
  circleColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigCircle: {
    fontSize: 80,
  },
  infoColumn: {
    flex: 1,
    marginLeft: 12,
  },
  label: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  score: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
  },
  nutrientContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 15,
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nutrientHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  arrow: {
    fontSize: 18,
    color: '#666',
  },
  nutrientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  nutrientLabel: {
    fontSize: 14,
    color: '#555',
  },
  nutrientValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  saveButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 15,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
